import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { DataProtectionService } from "../platform/crypto/data-protection.service.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { normalizeEnrollmentNumber } from "../servants/servant-identifiers.js";
import { operationalRulesSchema } from "../agreements/agreement-policy.schema.js";
import { availableMoney, compareMoney, subtractMoney } from "../reservations/reservation-money.js";
import {
  normalizedMarginRowSchema,
  parseMarginFile,
  type NormalizedMarginRow,
} from "./margin-file.parser.js";
import type {
  CreatePayrollCycleDto,
  InsertionFileMetadataDto,
  MarginFileMetadataDto,
  ReturnFileMetadataDto,
  UploadedMarginFile,
} from "./payroll.dto.js";
import {
  buildInsertionCsv,
  normalizedReturnRowSchema,
  parseReturnFile,
} from "./payroll-exchange.parser.js";
import { decideReconciliation } from "./payroll-reconciliation.js";

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function cents(value: string): bigint {
  const [units, decimals] = value.split(".");
  return BigInt(units!) * 100n + BigInt(decimals!);
}

function decimalFromCents(value: bigint): string {
  const text = value.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

function dateValue(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function assertIdempotencyKey(value: string | undefined): asserts value is string {
  if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new BadRequestException("Idempotency-Key obrigatoria e invalida");
  }
}

function safeCsvFile(file: UploadedMarginFile): string {
  const name = basename(file.originalname.replace(/\\/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .slice(0, 255);
  if (!name.toLowerCase().endsWith(".csv")) throw new BadRequestException("Somente arquivos CSV sao aceitos");
  if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new BadRequestException("Arquivo vazio ou acima de 5 MB");
  if (!["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.mimetype)) {
    throw new BadRequestException("Tipo de arquivo invalido");
  }
  return name;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly protection: DataProtectionService,
  ) {}

  async createCycle(agreementId: string, input: CreatePayrollCycleDto, context: RequestContext) {
    const competency = new Date(`${input.competency}-01T00:00:00.000Z`);
    const cutoffAt = new Date(input.cutoffAt);
    const insertionDueAt = input.insertionDueAt ? new Date(input.insertionDueAt) : null;
    const returnDueAt = input.returnDueAt ? new Date(input.returnDueAt) : null;
    if (insertionDueAt && insertionDueAt < cutoffAt) {
      throw new BadRequestException("Prazo de insercao anterior ao corte");
    }
    if (returnDueAt && insertionDueAt && returnDueAt < insertionDueAt) {
      throw new BadRequestException("Prazo de retorno anterior ao prazo de insercao");
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const agreement = await transaction.agreement.findUnique({
            where: { id: agreementId },
            select: { id: true, status: true },
          });
          if (!agreement) throw new NotFoundException("Convenio nao encontrado");
          if (agreement.status !== "ACTIVE") throw new ConflictException("Convenio nao esta ativo");
          const policy = await transaction.agreementPolicyVersion.findFirst({
            where: { agreementId, policyType: "OPERATIONAL_RULES", status: "ACTIVE" },
            orderBy: { versionNumber: "desc" },
            select: { id: true },
          });
          if (!policy) throw new ConflictException("Convenio nao possui politica operacional ativa");

          const cycle = await transaction.payrollCycle.create({
            data: {
              agreementId,
              competency,
              cutoffAt,
              insertionDueAt,
              returnDueAt,
              policyVersionId: policy.id,
            },
          });
          await transaction.auditEvent.create({
            data: {
              agreementId,
              actorUserId: context.actor?.userId ?? null,
              actorRole: context.actor?.role ?? null,
              action: "payroll_cycle.create",
              outcome: "success",
              entityType: "payroll_cycle",
              entityId: cycle.id,
              correlationId: context.correlationId,
              newData: { competency: input.competency, policyVersionId: policy.id },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return this.toCycleView(cycle);
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException("Competencia ja existe no convenio");
      throw error;
    }
  }

  async listCycles(agreementId: string) {
    const cycles = await this.prisma.payrollCycle.findMany({
      where: { agreementId },
      include: { _count: { select: { files: true } } },
      orderBy: { competency: "desc" },
      take: 36,
    });
    return cycles.map((cycle) => ({ ...this.toCycleView(cycle), fileCount: cycle._count.files }));
  }

  async uploadMarginFile(
    agreementId: string,
    cycleId: string,
    metadata: MarginFileMetadataDto,
    idempotencyKey: string | undefined,
    file: UploadedMarginFile,
    context: RequestContext,
  ) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key obrigatoria e invalida");
    }
    const safeFileName = basename(file.originalname.replace(/\\/g, "/"))
      .replace(/[\u0000-\u001f\u007f]/g, "_")
      .slice(0, 255);
    if (!safeFileName.toLowerCase().endsWith(".csv")) {
      throw new BadRequestException("Somente arquivos CSV sao aceitos");
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Arquivo vazio ou acima de 5 MB");
    }
    const allowedMediaTypes = new Set(["text/csv", "text/plain", "application/vnd.ms-excel"]);
    if (!allowedMediaTypes.has(file.mimetype)) throw new BadRequestException("Tipo de arquivo invalido");

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, agreementId },
    });
    if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
    if (!(["OPEN", "REVIEW"] as string[]).includes(cycle.status)) {
      throw new ConflictException("Ciclo nao aceita novos arquivos de margem");
    }

    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const existing = await this.prisma.payrollFile.findFirst({
      where: {
        agreementId,
        OR: [
          { idempotencyKey },
          { payrollCycleId: cycleId, fileType: "MARGIN", contentHash },
        ],
      },
    });
    if (existing) return { ...this.toFileView(existing), duplicate: true };

    const parsedRows = parseMarginFile(file.buffer);
    const enrollmentHashes = parsedRows
      .map((row) => row.normalizedData?.enrollmentNumber)
      .filter((value): value is string => Boolean(value))
      .map((value) => this.protection.lookupHash(value, "enrollment.number"));
    const enrollments = await this.prisma.enrollment.findMany({
      where: { agreementId, enrollmentLookupKey: { in: [...new Set(enrollmentHashes)] } },
      select: { id: true, enrollmentLookupKey: true },
    });
    const enrollmentByHash = new Map(
      enrollments.map((enrollment) => [enrollment.enrollmentLookupKey, enrollment.id]),
    );
    const seen = new Set<string>();
    let totalAmount = 0n;
    const stagedRows = parsedRows.map((row) => {
      const errors = [...row.errors];
      const enrollmentNumber = row.normalizedData?.enrollmentNumber ??
        normalizeEnrollmentNumber(row.rawData.matricula ?? "");
      const lookupHash = enrollmentNumber
        ? this.protection.lookupHash(enrollmentNumber, "enrollment.number")
        : null;
      let enrollmentId = lookupHash ? enrollmentByHash.get(lookupHash) ?? null : null;
      if (lookupHash && seen.has(lookupHash)) errors.push("matricula: duplicada no arquivo");
      if (lookupHash) seen.add(lookupHash);
      if (row.normalizedData && !enrollmentId) errors.push("matricula: nao cadastrada no convenio");
      if (errors.length) enrollmentId = null;

      let normalizedData: Omit<NormalizedMarginRow, "enrollmentNumber"> | null = null;
      if (row.normalizedData && errors.length === 0) {
        const { enrollmentNumber: _ignored, ...safeData } = row.normalizedData;
        normalizedData = safeData;
        totalAmount += cents(row.normalizedData.marginBase);
      }
      return {
        agreementId,
        rowNumber: row.rowNumber,
        enrollmentId,
        externalReferenceHash: lookupHash,
        amount: normalizedData?.marginBase ?? null,
        status: errors.length ? ("INVALID" as const) : ("VALID" as const),
        rawDataEncrypted: this.protection.encrypt(
          JSON.stringify(row.rawData),
          "payroll.margin_row",
        ),
        normalizedData,
        errors,
      };
    });
    const invalidRows = stagedRows.filter((row) => row.status === "INVALID").length;
    const validRows = stagedRows.length - invalidRows;
    const protocolNumber = `MG-${cycle.competency.toISOString().slice(0, 7).replace("-", "")}-${contentHash.slice(0, 12).toUpperCase()}`;

    try {
      const stored = await this.prisma.$transaction(
        async (transaction) => {
          const currentCycle = await transaction.payrollCycle.findFirst({
            where: { id: cycleId, agreementId, status: { in: ["OPEN", "REVIEW"] } },
            select: { id: true },
          });
          if (!currentCycle) throw new ConflictException("Ciclo nao aceita novos arquivos de margem");
          const payrollFile = await transaction.payrollFile.create({
            data: {
              agreementId,
              payrollCycleId: cycleId,
              fileType: "MARGIN",
              direction: "INBOUND",
              environment: metadata.environment,
              layoutVersion: metadata.layoutVersion,
              protocolNumber,
              originalFileName: safeFileName,
              contentHash,
              sizeBytes: BigInt(file.size),
              mediaType: file.mimetype,
              status: invalidRows ? "REJECTED" : "VALIDATED",
              totalRows: stagedRows.length,
              validRows,
              invalidRows,
              totalAmount: decimalFromCents(totalAmount),
              idempotencyKey,
              uploadedByUserId: context.actor!.userId,
            },
          });
          await transaction.payrollFileRow.createMany({
            data: stagedRows.map(({ normalizedData, ...row }) => ({
              ...row,
              payrollFileId: payrollFile.id,
              ...(normalizedData ? { normalizedData } : {}),
            })),
          });
          await transaction.payrollCycle.update({
            where: { id: cycleId },
            data: { status: "REVIEW", version: { increment: 1 } },
          });
          await transaction.auditEvent.create({
            data: {
              agreementId,
              actorUserId: context.actor?.userId ?? null,
              actorRole: context.actor?.role ?? null,
              action: "payroll_margin_file.stage",
              outcome: invalidRows ? "rejected" : "success",
              entityType: "payroll_file",
              entityId: payrollFile.id,
              correlationId: context.correlationId,
              newData: {
                protocolNumber,
                totalRows: stagedRows.length,
                validRows,
                invalidRows,
                description: metadata.description,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return payrollFile;
        },
        { isolationLevel: "Serializable" },
      );
      return { ...this.toFileView(stored), duplicate: false };
    } catch (error) {
      if (isUniqueConflict(error)) {
        const duplicate = await this.prisma.payrollFile.findFirst({
          where: {
            agreementId,
            OR: [
              { idempotencyKey },
              { payrollCycleId: cycleId, fileType: "MARGIN", contentHash },
            ],
          },
        });
        if (duplicate) return { ...this.toFileView(duplicate), duplicate: true };
      }
      throw error;
    }
  }

  async generateInsertionFile(
    agreementId: string,
    cycleId: string,
    metadata: InsertionFileMetadataDto,
    idempotencyKey: string | undefined,
    context: RequestContext,
  ) {
    assertIdempotencyKey(idempotencyKey);
    const duplicate = await this.prisma.payrollFile.findFirst({ where: { agreementId, idempotencyKey } });
    if (duplicate) return { ...this.toFileView(duplicate), duplicate: true };

    return this.prisma.$transaction(async (transaction) => {
      const cycle = await transaction.payrollCycle.findFirst({
        where: { id: cycleId, agreementId },
        include: { policyVersion: true },
      });
      if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
      if (cycle.status !== "PUBLISHED" || !cycle.policyVersion) {
        throw new ConflictException("Ciclo precisa ter a margem publicada antes da insercao");
      }
      const existing = await transaction.payrollFile.findFirst({
        where: { payrollCycleId: cycleId, fileType: "INSERTION", status: { not: "REJECTED" } },
      });
      if (existing) throw new ConflictException("Ciclo ja possui arquivo de insercao gerado");
      const policy = operationalRulesSchema.safeParse(cycle.policyVersion.payload);
      if (!policy.success || !policy.data.marginGroups?.length) {
        throw new ConflictException("Politica do ciclo nao possui rubricas de folha validas");
      }
      const rubricByFamily = new Map<string, string>();
      for (const group of policy.data.marginGroups) {
        if (!group.payrollRubricCode) continue;
        for (const family of group.productFamilies) rubricByFamily.set(family, group.payrollRubricCode);
      }

      const contracts = await transaction.contract.findMany({
        where: {
          agreementId,
          status: "ACTIVE",
          activatedAt: { lte: cycle.cutoffAt },
          OR: [{ firstCompetency: null }, { firstCompetency: { lte: cycle.competency } }],
        },
        include: { party: true, product: true, enrollment: true },
        orderBy: [{ partyId: "asc" }, { contractNumber: "asc" }],
      });
      const cycleCompetency = cycle.competency.toISOString().slice(0, 7);
      const candidates = contracts.filter((contract) => {
        const firstCompetency = contract.firstCompetency?.toISOString().slice(0, 7)
          ?? contract.firstDueDate?.toISOString().slice(0, 7)
          ?? cycleCompetency;
        const hasRemainingCharge = contract.product.chargeMode !== "FIXED_INSTALLMENTS"
          || contract.termInstallments === null
          || contract.currentInstallment < contract.termInstallments;
        return firstCompetency <= cycleCompetency && hasRemainingCharge;
      });
      if (candidates.length === 0) throw new ConflictException("Nenhum contrato elegivel para insercao no ciclo");
      const generated = candidates.map((contract) => {
        const rubric = rubricByFamily.get(contract.product.family);
        if (!rubric) throw new ConflictException(`Produto ${contract.product.code} sem rubrica configurada`);
        const installmentNumber = contract.product.chargeMode === "FIXED_INSTALLMENTS"
          ? contract.currentInstallment + 1
          : null;
        const raw = {
          consignataria_documento: contract.party.documentNumber.replace(/\D/g, ""),
          matricula: this.protection.decrypt(contract.enrollment.enrollmentNumberEncrypted, "enrollment.number"),
          contrato: contract.contractNumber,
          rubrica: rubric,
          valor: contract.installmentAmount.toString(),
          competencia: cycleCompetency,
          parcela: installmentNumber,
          total_parcelas: contract.termInstallments,
          tipo_operacao: contract.operationType,
          produto: contract.product.code,
        };
        return { contract, installmentNumber, raw };
      });
      const buffer = buildInsertionCsv(generated.map(({ raw }) => Object.values(raw)));
      const contentHash = createHash("sha256").update(buffer).digest("hex");
      const competency = cycle.competency.toISOString().slice(0, 7).replace("-", "");
      const protocolNumber = `IN-${competency}-${contentHash.slice(0, 12).toUpperCase()}`;
      const totalAmount = generated.reduce((sum, item) => sum + cents(item.contract.installmentAmount.toString()), 0n);
      const file = await transaction.payrollFile.create({
        data: {
          agreementId,
          payrollCycleId: cycleId,
          fileType: "INSERTION",
          direction: "OUTBOUND",
          environment: metadata.environment,
          layoutVersion: metadata.layoutVersion,
          protocolNumber,
          originalFileName: `insercao-${competency}.csv`,
          contentHash,
          sizeBytes: BigInt(buffer.length),
          mediaType: "text/csv",
          status: "VALIDATED",
          totalRows: generated.length,
          validRows: generated.length,
          invalidRows: 0,
          totalAmount: decimalFromCents(totalAmount),
          idempotencyKey,
          uploadedByUserId: context.actor!.userId,
        },
      });
      for (const [index, item] of generated.entries()) {
        const row = await transaction.payrollFileRow.create({
          data: {
            agreementId,
            payrollFileId: file.id,
            rowNumber: index + 2,
            enrollmentId: item.contract.enrollmentId,
            amount: item.contract.installmentAmount,
            status: "VALID",
            rawDataEncrypted: this.protection.encrypt(JSON.stringify(item.raw), "payroll.insertion_row"),
            normalizedData: {
              contractId: item.contract.id,
              installmentNumber: item.installmentNumber,
              rubricCode: item.raw.rubrica,
            },
            errors: [],
          },
        });
        await transaction.payrollInstruction.create({
          data: {
            agreementId,
            payrollCycleId: cycleId,
            contractId: item.contract.id,
            enrollmentId: item.contract.enrollmentId,
            sourceFileRowId: row.id,
            installmentNumber: item.installmentNumber,
            amount: item.contract.installmentAmount,
          },
        });
      }
      await transaction.auditEvent.create({
        data: {
          agreementId,
          actorUserId: context.actor?.userId ?? null,
          actorRole: context.actor?.role ?? null,
          action: "payroll_insertion_file.generate",
          outcome: "success",
          entityType: "payroll_file",
          entityId: file.id,
          correlationId: context.correlationId,
          newData: { protocolNumber, competency, contractCount: generated.length, cutoffAt: cycle.cutoffAt.toISOString() },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      await transaction.outboxEvent.create({ data: {
        agreementId, aggregateType: "payroll_file", aggregateId: file.id,
        eventTyp…56 tokens truncated…n { ...this.toFileView(file), duplicate: false };
    }, { isolationLevel: "Serializable" });
  }

  async downloadInsertionFile(agreementId: string, cycleId: string, fileId: string) {
    const file = await this.prisma.payrollFile.findFirst({
      where: { id: fileId, agreementId, payrollCycleId: cycleId, fileType: "INSERTION" },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!file) throw new NotFoundException("Arquivo de insercao nao encontrado");
    const rows = file.rows.map((row) => {
      const raw = JSON.parse(this.protection.decrypt(row.rawDataEncrypted, "payroll.insertion_row")) as Record<string, string | number | null>;
      return Object.values(raw);
    });
    const buffer = buildInsertionCsv(rows);
    if (createHash("sha256").update(buffer).digest("hex") !== file.contentHash) {
      throw new ConflictException("Integridade do arquivo de insercao comprometida");
    }
    return {
      fileName: file.originalFileName,
      mediaType: file.mediaType,
      buffer,
      contentHash: file.contentHash,
    };
  }

  async uploadReturnFile(
    agreementId: string,
    cycleId: string,
    metadata: ReturnFileMetadataDto,
    idempotencyKey: string | undefined,
    file: UploadedMarginFile,
    context: RequestContext,
  ) {
    assertIdempotencyKey(idempotencyKey);
    const safeFileName = safeCsvFile(file);
    const cycle = await this.prisma.payrollCycle.findFirst({ where: { id: cycleId, agreementId } });
    if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
    if (!(cycle.status === "PUBLISHED" || cycle.status === "CLOSED")) throw new ConflictException("Ciclo nao aceita arquivo retorno");
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const duplicate = await this.prisma.payrollFile.findFirst({
      where: { agreementId, OR: [{ idempotencyKey }, { payrollCycleId: cycleId, fileType: "RETURN", contentHash }] },
    });
    if (duplicate) return { ...this.toFileView(duplicate), duplicate: true };

    const parsedRows = parseReturnFile(file.buffer);
    const instructions = await this.prisma.payrollInstruction.findMany({
      where: { payrollCycleId: cycleId },
      include: { contract: { include: { party: true } } },
    });
    const instructionByKey = new Map(instructions.map((item) => [
      `${item.contract.party.documentNumber.replace(/\D/g, "")}|${item.contract.contractNumber}`,
      item,
    ]));
    let totalAmount = 0n;
    const seen = new Set<string>();
    const staged = parsedRows.map((row) => {
      const errors = [...row.errors];
      const data = row.normalizedData;
      const key = data ? `${data.partyDocument}|${data.contractNumber}` : "";
      const instruction = data ? instructionByKey.get(key) : undefined;
      if (data?.competency !== cycle.competency.toISOString().slice(0, 7)) errors.push("competencia: diferente do ciclo");
      if (key && seen.has(key)) errors.push("contrato: duplicado no arquivo");
      if (key) seen.add(key);
      if (data && !instruction) errors.push("contrato: nao consta no arquivo de insercao do ciclo");
      if (instruction?.status === "RECONCILED") errors.push("contrato: instrucao ja conciliada");
      if (data && instruction && data.installmentNumber !== instruction.installmentNumber) errors.push("parcela: diferente da instrucao enviada");
      if (data && instruction && compareMoney(data.expectedAmount, instruction.amount.toString()) !== 0) errors.push("valor_previsto: diferente da instrucao enviada");
      if (data && errors.length === 0) totalAmount += cents(data.discountedAmount);
      return {
        agreementId,
        rowNumber: row.rowNumber,
        enrollmentId: errors.length ? null : instruction!.enrollmentId,
        amount: errors.length ? null : data!.discountedAmount,
        status: errors.length ? ("INVALID" as const) : ("VALID" as const),
        rawDataEncrypted: this.protection.encrypt(JSON.stringify(row.rawData), "payroll.return_row"),
        normalizedData: errors.length ? null : { ...data!, instructionId: instruction!.id },
        errors,
      };
    });
    const invalidRows = staged.filter((row) => row.status === "INVALID").length;
    const competency = cycle.competency.toISOString().slice(0, 7).replace("-", "");
    const protocolNumber = `RT-${competency}-${contentHash.slice(0, 12).toUpperCase()}`;
    const stored = await this.prisma.$transaction(async (transaction) => {
      const payrollFile = await transaction.payrollFile.create({
        data: {
          agreementId, payrollCycleId: cycleId, fileType: "RETURN", direction: "INBOUND",
          environment: metadata.environment, layoutVersion: metadata.layoutVersion, protocolNumber,
          originalFileName: safeFileName, contentHash, sizeBytes: BigInt(file.size), mediaType: file.mimetype,
          status: invalidRows ? "REJECTED" : "VALIDATED", totalRows: staged.length,
          validRows: staged.length - invalidRows, invalidRows, totalAmount: decimalFromCents(totalAmount),
          idempotencyKey, uploadedByUserId: context.actor!.userId,
        },
      });
      await transaction.payrollFileRow.createMany({ data: staged.map(({ normalizedData, ...row }) => ({ ...row, payrollFileId: payrollFile.id, ...(normalizedData ? { normalizedData } : {}) })) });
      await transaction.auditEvent.create({ data: {
        agreementId, actorUserId: context.actor?.userId ?? null, actorRole: context.actor?.role ?? null,
        action: "payroll_return_file.stage", outcome: invalidRows ? "rejected" : "success",
        entityType: "payroll_file", entityId: payrollFile.id, correlationId: context.correlationId,
        newData: { protocolNumber, totalRows: staged.length, invalidRows, description: metadata.description },
        ipAddress: context.ipAddress, userAgent: context.userAgent,
      } });
      return payrollFile;
    }, { isolationLevel: "Serializable" });
    return { ...this.toFileView(stored), duplicate: false };
  }

  async applyReturnFile(agreementId: string, cycleId: string, fileId: string, context: RequestContext) {
    return this.prisma.$transaction(async (transaction) => {
      const file = await transaction.payrollFile.findFirst({
        where: { id: fileId, agreementId, payrollCycleId: cycleId, fileType: "RETURN" },
        include: { rows: { where: { status: "VALID" }, orderBy: { rowNumber: "asc" } } },
      });
      if (!file) throw new NotFoundException("Arquivo retorno nao encontrado");
      if (file.status === "APPLIED") return { ...this.toFileView(file), duplicate: true };
      if (file.status !== "VALIDATED" || file.invalidRows > 0) throw new ConflictException("Arquivo retorno nao esta validado");
      const claimed = await transaction.payrollFile.updateMany({ where: { id: fileId, status: "VALIDATED" }, data: { status: "PROCESSING" } });
      if (claimed.count !== 1) throw new ConflictException("Arquivo retorno ja esta em processamento");
      let full = 0;
      let partial = 0;
      let rejected = 0;
      let settled = 0;
      for (const row of file.rows) {
        const raw = row.normalizedData as Record<string, unknown> | null;
        const parsed = normalizedReturnRowSchema.safeParse(raw);
        const instructionId = typeof raw?.instructionId === "string" ? raw.instructionId : null;
        if (!parsed.success || !instructionId) throw new ConflictException("Staging do retorno inconsistente");
        const instruction = await transaction.payrollInstruction.findFirst({
          where: { id: instructionId, agreementId, payrollCycleId: cycleId, status: "GENERATED" },
          include: { contract: { include: { product: true, marginAccount: true } } },
        });
        if (!instruction) throw new ConflictException("Instrucao de desconto indisponivel");
        const contract = instruction.contract;
        if (contract.status !== "ACTIVE") throw new ConflictException("Contrato nao esta ativo");
        if (instruction.installmentNumber !== null && instruction.installmentNumber !== contract.currentInstallment + 1) {
          throw new ConflictException("Sequencia de parcelas do contrato foi alterada");
        }
        const event = await transaction.payrollDiscountEvent.create({ data: {
          agreementId, payrollCycleId: cycleId, instructionId: instruction.id, contractId: contract.id,
          enrollmentId: instruction.enrollmentId, sourceFileRowId: row.id,
          expectedAmount: parsed.data.expectedAmount, discountedAmount: parsed.data.discountedAmount,
          outcome: parsed.data.outcome, installmentNumber: parsed.data.installmentNumber, reason: parsed.data.reason,
        } });
        if (parsed.data.outcome === "FULL") {
          full += 1;
          const decision = decideReconciliation({
            outcome: parsed.data.outcome,
            chargeMode: contract.product.chargeMode,
            currentInstallment: contract.currentInstallment,
            termInstallments: contract.termInstallments,
          });
          await transaction.contract.update({ where: { id: contract.id }, data: {
            currentInstallment: decision.nextInstallment, status: decision.settlesContract ? "SETTLED" : "ACTIVE",
            settledAt: decision.settlesContract ? new Date() : null, version: { increment: 1 },
          } });
          if (decision.settlesContract) {
            settled += 1;
            const account = contract.marginAccount;
            const consumed = compareMoney(account.consumedAmount.toString(), contract.installmentAmount.toString()) >= 0
              ? subtractMoney(account.consumedAmount.toString(), contract.installmentAmount.toString())
              : "0.00";
            const available = availableMoney(account.totalAmount.toString(), consumed, account.reservedAmount.toString(), account.blockedAmount.toString());
            const updated = await transaction.marginAccount.updateMany({
              where: { id: account.id, lockVersion: account.lockVersion },
              data: { consumedAmount: consumed, availableAmount: available, lockVersion: { increment: 1 } },
            });
            if (updated.count !== 1) throw new ConflictException("Margem foi alterada durante a liquidacao");
            await transaction.marginMovement.create({ data: {
              agreementId, marginAccountId: account.id, enrollmentId: instruction.enrollmentId,
              movementType: "RELEASE", direction: compareMoney(available, account.availableAmount.toString()) > 0 ? "INCREASE" : "NO_CHANGE",
              amount: contract.installmentAmount, balanceBefore: account.availableAmount, balanceAfter: available,
              sourceType: "payroll_discount_event", sourceId: event.id,
              idempotencyKey: `payroll-settlement:${event.id}`, correlationId: context.correlationId,
              actorUserId: context.actor?.userId ?? null, reason: "Liquidacao automatica na ultima parcela descontada",
            } });
          }
        } else if (parsed.data.outcome === "PARTIAL") partial += 1;
        else rejected += 1;
        await transaction.payrollInstruction.update({ where: { id: instruction.id }, data: { status: "RECONCILED", reconciledAt: new Date() } });
      }
      await transaction.payrollFileRow.updateMany({ where: { payrollFileId: fileId, status: "VALID" }, data: { status: "APPLIED" } });
      const applied = await transaction.payrollFile.update({ where: { id: fileId }, data: { status: "APPLIED", processedByUserId: context.actor!.userId, processedAt: new Date() } });
      const pending = await transaction.payrollInstruction.count({ where: { payrollCycleId: cycleId, status: "GENERATED" } });
      if (pending === 0) await transaction.payrollCycle.update({ where: { id: cycleId }, data: { status: "CLOSED", closedByUserId: context.actor!.userId, closedAt: new Date(), version: { increment: 1 } } });
      await transaction.auditEvent.create({ data: {
        agreementId, actorUserId: context.actor?.userId ?? null, actorRole: context.actor?.role ?? null,
        action: "payroll_return_file.apply", outcome: "success", entityType: "payroll_file", entityId: fileId,
        correlationId: context.correlationId, newData: { full, partial, rejected, settled, pendingInstructions: pending },
        ipAddress: context.ipAddress, userAgent: context.userAgent,
      } });
      await transaction.outboxEvent.create({ data: {
        agreementId, aggregateType: "payroll_file", aggregateId: fileId,
        eventType: "payroll.return_applied",
        payload: { payrollFileId: fileId, payrollCycleId: cycleId, full, partial, rejected, settled, pendingInstructions: pending },
        correlationId: context.correlationId,
      } });
      return { ...this.toFileView(applied), duplicate: false, reconciliation: { full, partial, rejected, settled, pending } };
    }, { isolationLevel: "Serializable" });
  }

  async getFile(agreementId: string, cycleId: string, fileId: string) {
    const file = await this.prisma.payrollFile.findFirst({
      where: { id: fileId, agreementId, payrollCycleId: cycleId },
      include: {
        rows: {
          select: {
            id: true,
            rowNumber: true,
            status: true,
            amount: true,
            normalizedData: true,
            errors: true,
          },
          orderBy: { rowNumber: "asc" },
          take: 10_000,
        },
      },
    });
    if (!file) throw new NotFoundException("Arquivo de folha nao encontrado");
    return {
      ...this.toFileView(file),
      rows: file.rows.map((row) => ({ ...row, amount: row.amount?.toString() ?? null })),
    };
  }

  async publishMarginFile(
    agreementId: string,
    cycleId: string,
    fileId: string,
    context: RequestContext,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const file = await transaction.payrollFile.findFirst({
          where: { id: fileId, agreementId, payrollCycleId: cycleId, fileType: "MARGIN" },
          include: { rows: { where: { status: "VALID" }, orderBy: { rowNumber: "asc" } } },
        });
        if (!file) throw new NotFoundException("Arquivo de margem nao encontrado");
        if (file.status === "APPLIED") return { ...this.toFileView(file), duplicate: true };
        if (file.status !== "VALIDATED" || file.invalidRows > 0) {
          throw new ConflictException("Arquivo nao esta validado para publicacao");
        }
        const claimed = await transaction.payrollFile.updateMany({
          where: { id: fileId, status: "VALIDATED" },
          data: { status: "PROCESSING" },
        });
        if (claimed.count !== 1) throw new ConflictException("Arquivo ja esta em processamento");

        for (const row of file.rows) {
          if (!row.enrollmentId) throw new ConflictException("Linha valida sem matricula vinculada");
          const parsed = normalizedMarginRowSchema.omit({ enrollmentNumber: true }).safeParse(
            row.normalizedData,
          );
          if (!parsed.success) throw new ConflictException("Staging de margem inconsistente");
          const current = await transaction.enrollment.findFirst({
            where: { id: row.enrollmentId, agreementId },
          });
          if (!current) throw new ConflictException("Matricula do staging nao esta disponivel");
          const afterData = parsed.data;
          await transaction.enrollmentPayrollSnapshot.create({
            data: {
              agreementId,
              payrollCycleId: cycleId,
              enrollmentId: current.id,
              sourceFileRowId: row.id,
              beforeData: {
                functionalStatus: current.functionalStatus,
                employmentType: current.employmentType,
                payrollGroup: current.payrollGroup,
                department: current.department,
                costCenter: current.costCenter,
                baseSalary: current.baseSalary.toString(),
                mandatoryDeductions: current.mandatoryDeductions.toString(),
                marginBase: current.marginBase.toString(),
                sourceUpdatedAt: dateValue(current.sourceUpdatedAt),
                version: current.version,
              },
              afterData,
            },
          });
          await transaction.enrollment.update({
            where: { id: current.id },
            data: {
              functionalStatus: afterData.functionalStatus,
              employmentType: afterData.employmentType,
              payrollGroup: afterData.payrollGroup,
              department: afterData.department,
              costCenter: afterData.costCenter,
              baseSalary: afterData.baseSalary,
              mandatoryDeductions: afterData.mandatoryDeductions,
              marginBase: afterData.marginBase,
              sourceUpdatedAt: afterData.sourceUpdatedAt
                ? new Date(afterData.sourceUpdatedAt)
                : new Date(),
              version: { increment: 1 },
            },
          });
        }

        await transaction.payrollFileRow.updateMany({
          where: { payrollFileId: fileId, status: "VALID" },
          data: { status: "APPLIED" },
        });
        const applied = await transaction.payrollFile.update({
          where: { id: fileId },
          data: {
            status: "APPLIED",
            processedByUserId: context.actor!.userId,
            processedAt: new Date(),
          },
        });
        await transaction.payrollCycle.update({
          where: { id: cycleId },
          data: { status: "PUBLISHED", version: { increment: 1 } },
        });
        await transaction.auditEvent.create({
          data: {
            agreementId,
            actorUserId: context.actor?.userId ?? null,
            actorRole: context.actor?.role ?? null,
            action: "payroll_margin_file.publish",
            outcome: "success",
            entityType: "payroll_file",
            entityId: fileId,
            correlationId: context.correlationId,
            newData: { protocolNumber: file.protocolNumber, appliedRows: file.validRows },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return { ...this.toFileView(applied), duplicate: false };
      },
      { isolationLevel: "Serializable" },
    );
  }

  private toCycleView(cycle: {
    id: string;
    agreementId: string;
    competency: Date;
    cutoffAt: Date;
    insertionDueAt: Date | null;
    returnDueAt: Date | null;
    status: string;
    policyVersionId: string | null;
    version: number;
  }) {
    return {
      id: cycle.id,
      agreementId: cycle.agreementId,
      competency: cycle.competency.toISOString().slice(0, 7),
      cutoffAt: cycle.cutoffAt.toISOString(),
      insertionDueAt: dateValue(cycle.insertionDueAt),
      returnDueAt: dateValue(cycle.returnDueAt),
      status: cycle.status,
      policyVersionId: cycle.policyVersionId,
      version: cycle.version,
    };
  }

  private toFileView(file: {
    id: string;
    agreementId: string;
    payrollCycleId: string;
    protocolNumber: string;
    originalFileName: string;
    layoutVersion: string;
    environment: string;
    status: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    totalAmount: { toString(): string };
    sizeBytes: bigint;
    createdAt: Date;
    processedAt: Date | null;
  }) {
    return {
      id: file.id,
      agreementId: file.agreementId,
      payrollCycleId: file.payrollCycleId,
      protocolNumber: file.protocolNumber,
      originalFileName: file.originalFileName,
      layoutVersion: file.layoutVersion,
      environment: file.environment,
      status: file.status,
      totalRows: file.totalRows,
      validRows: file.validRows,
      invalidRows: file.invalidRows,
      totalAmount: file.totalAmount.toString(),
      sizeBytes: file.sizeBytes.toString(),
      createdAt: file.createdAt.toISOString(),
      processedAt: dateValue(file.processedAt),
    };
  }
}

