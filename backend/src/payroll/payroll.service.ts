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
  AcknowledgePayrollExceptionDto,
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

  async listFiles(agreementId: string, cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, agreementId },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
    const files = await this.prisma.payrollFile.findMany({
      where: { agreementId, payrollCycleId: cycleId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return files.map((file) => ({
      ...this.toFileView(file),
      fileType: file.fileType,
      direction: file.direction,
    }));
  }

  async getOperations(agreementId: string, cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({ where: { id: cycleId, agreementId } });
    if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");

    const instructionWhere = { agreementId, payrollCycleId: cycleId } as const;
    const eventWhere = { agreementId, payrollCycleId: cycleId } as const;
    const [
      files,
      instructionTotals,
      pendingCount,
      reconciledCount,
      fullCount,
      partialCount,
      rejectedCount,
      openExceptionCount,
      inReviewExceptionCount,
      discountTotals,
      settlementEvents,
      pendingInstructions,
      exceptions,
    ] = await Promise.all([
      this.prisma.payrollFile.findMany({
        where: { agreementId, payrollCycleId: cycleId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.payrollInstruction.aggregate({
        where: instructionWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payrollInstruction.count({ where: { ...instructionWhere, status: "GENERATED" } }),
      this.prisma.payrollInstruction.count({ where: { ...instructionWhere, status: "RECONCILED" } }),
      this.prisma.payrollDiscountEvent.count({ where: { ...eventWhere, outcome: "FULL" } }),
      this.prisma.payrollDiscountEvent.count({ where: { ...eventWhere, outcome: "PARTIAL" } }),
      this.prisma.payrollDiscountEvent.count({ where: { ...eventWhere, outcome: "REJECTED" } }),
      this.prisma.payrollDiscountEvent.count({ where: { ...eventWhere, exceptionStatus: "OPEN" } }),
      this.prisma.payrollDiscountEvent.count({ where: { ...eventWhere, exceptionStatus: "IN_REVIEW" } }),
      this.prisma.payrollDiscountEvent.aggregate({ where: eventWhere, _sum: { discountedAmount: true } }),
      this.prisma.payrollDiscountEvent.findMany({
        where: { ...eventWhere, outcome: "FULL" },
        select: {
          installmentNumber: true,
          contract: {
            select: {
              termInstallments: true,
              product: { select: { chargeMode: true } },
            },
          },
        },
      }),
      this.prisma.payrollInstruction.findMany({
        where: { ...instructionWhere, status: "GENERATED" },
        include: { contract: { include: { party: true, product: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      this.prisma.payrollDiscountEvent.findMany({
        where: { ...eventWhere, outcome: { in: ["PARTIAL", "REJECTED"] } },
        include: {
          acknowledgedBy: { select: { id: true, name: true } },
          contract: { include: { party: true, product: true } },
        },
        orderBy: { processedAt: "desc" },
        take: 100,
      }),
    ]);

    const settledCount = settlementEvents.filter((event) =>
      event.contract.product.chargeMode === "FIXED_INSTALLMENTS"
      && event.installmentNumber !== null
      && event.contract.termInstallments !== null
      && event.installmentNumber >= event.contract.termInstallments,
    ).length;

    return {
      cycle: this.toCycleView(cycle),
      summary: {
        instructed: instructionTotals._count._all,
        pending: pendingCount,
        reconciled: reconciledCount,
        full: fullCount,
        partial: partialCount,
        rejected: rejectedCount,
        openExceptions: openExceptionCount,
        inReviewExceptions: inReviewExceptionCount,
        settledContracts: settledCount,
        instructedAmount: instructionTotals._sum.amount?.toString() ?? "0.00",
        discountedAmount: discountTotals._sum.discountedAmount?.toString() ?? "0.00",
      },
      files: files.map((file) => ({
        ...this.toFileView(file),
        fileType: file.fileType,
        direction: file.direction,
      })),
      pendingInstructions: pendingInstructions.map((instruction) => ({
        id: instruction.id,
        contractId: instruction.contractId,
        contractNumber: instruction.contract.contractNumber,
        installmentNumber: instruction.installmentNumber,
        amount: instruction.amount.toString(),
        party: {
          id: instruction.contract.party.id,
          name: instruction.contract.party.tradeName ?? instruction.contract.party.legalName,
        },
        product: {
          id: instruction.contract.product.id,
          code: instruction.contract.product.code,
          name: instruction.contract.product.name,
          family: instruction.contract.product.family,
        },
      })),
      exceptions: exceptions.map((event) => ({
        id: event.id,
        contractId: event.contractId,
        contractNumber: event.contract.contractNumber,
        outcome: event.outcome,
        installmentNumber: event.installmentNumber,
        expectedAmount: event.expectedAmount.toString(),
        discountedAmount: event.discountedAmount.toString(),
        reason: event.reason,
        exceptionStatus: event.exceptionStatus,
        acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
        acknowledgedBy: event.acknowledgedBy,
        reviewNote: event.reviewNoteEncrypted
          ? this.protection.decrypt(event.reviewNoteEncrypted, "payroll.exception_note")
          : null,
        processedAt: event.processedAt.toISOString(),
        party: {
          id: event.contract.party.id,
          name: event.contract.party.tradeName ?? event.contract.party.legalName,
        },
        product: {
          id: event.contract.product.id,
          code: event.contract.product.code,
          name: event.contract.product.name,
          family: event.contract.product.family,
        },
      })),
    };
  }

  async listExceptions(agreementId: string, cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, agreementId },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
    const events = await this.prisma.payrollDiscountEvent.findMany({
      where: { agreementId, payrollCycleId: cycleId, outcome: { in: ["PARTIAL", "REJECTED"] } },
      include: {
        acknowledgedBy: { select: { id: true, name: true } },
        contract: { include: { party: true, product: true } },
      },
      orderBy: [{ exceptionStatus: "asc" }, { processedAt: "desc" }],
      take: 500,
    });
    return events.map((event) => this.exceptionView(event));
  }

  async acknowledgeException(
    agreementId: string,
    cycleId: string,
    eventId: string,
    input: AcknowledgePayrollExceptionDto,
    context: RequestContext,
  ) {
    const note = input.note.trim();
    if (note.length < 3) throw new BadRequestException("Observacao da analise e obrigatoria");
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.payrollDiscountEvent.findFirst({
        where: {
          id: eventId,
          agreementId,
          payrollCycleId: cycleId,
          outcome: { in: ["PARTIAL", "REJECTED"] },
        },
        include: {
          acknowledgedBy: { select: { id: true, name: true } },
          contract: { include: { party: true, product: true } },
        },
      });
      if (!event) throw new NotFoundException("Excecao de folha nao encontrada");
      if (event.exceptionStatus === "IN_REVIEW") {
        return { ...this.exceptionView(event), duplicate: true };
      }
      if (event.exceptionStatus !== "OPEN") throw new ConflictException("Excecao nao esta aberta");
      const acknowledgedAt = new Date();
      const protectedNote = this.protection.encrypt(note, "payroll.exception_note");
      const claimed = await transaction.payrollDiscountEvent.updateMany({
        where: { id: event.id, exceptionStatus: "OPEN", reviewVersion: event.reviewVersion },
        data: {
          exceptionStatus: "IN_REVIEW",
          acknowledgedByUserId: context.actor!.userId,
          acknowledgedAt,
          reviewNoteEncrypted: protectedNote,
          reviewVersion: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new ConflictException("Excecao foi assumida por outro operador");
      await transaction.auditEvent.create({ data: {
        agreementId,
        actorUserId: context.actor?.userId ?? null,
        actorRole: context.actor?.role ?? null,
        action: "payroll_exception.acknowledge",
        outcome: "success",
        entityType: "payroll_discount_event",
        entityId: event.id,
        correlationId: context.correlationId,
        previousData: { exceptionStatus: "OPEN", reviewVersion: event.reviewVersion },
        newData: { exceptionStatus: "IN_REVIEW", outcome: event.outcome },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      } });
      await transaction.outboxEvent.create({ data: {
        agreementId,
        aggregateType: "payroll_discount_event",
        aggregateId: event.id,
        eventType: "payroll.exception_acknowledged",
        payload: { payrollCycleId: cycleId, contractId: event.contractId, outcome: event.outcome },
        correlationId: context.correlationId,
      } });
      const updated = await transaction.payrollDiscountEvent.findUnique({
        where: { id: event.id },
        include: {
          acknowledgedBy: { select: { id: true, name: true } },
          contract: { include: { party: true, product: true } },
        },
      });
      if (!updated) throw new ConflictException("Excecao nao esta mais disponivel");
      return {
        ...this.exceptionView(updated),
        duplicate: false,
      };
    }, { isolationLevel: "Serializable" });
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
    const invalidRows = stage…3093 tokens truncated…here: { agreementId, OR: [{ idempotencyKey }, { payrollCycleId: cycleId, fileType: "RETURN", contentHash }] },
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
          exceptionStatus: parsed.data.outcome === "FULL" ? null : "OPEN",
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

  private exceptionView(event: {
    id: string;
    contractId: string;
    outcome: string;
    installmentNumber: number | null;
    expectedAmount: { toString(): string };
    discountedAmount: { toString(): string };
    reason: string | null;
    exceptionStatus: string | null;
    acknowledgedAt: Date | null;
    acknowledgedBy: { id: string; name: string } | null;
    reviewNoteEncrypted: string | null;
    reviewVersion: number;
    processedAt: Date;
    contract: {
      contractNumber: string;
      party: { id: string; tradeName: string | null; legalName: string };
      product: { id: string; code: string; name: string; family: string };
    };
  }) {
    return {
      id: event.id,
      contractId: event.contractId,
      contractNumber: event.contract.contractNumber,
      outcome: event.outcome,
      installmentNumber: event.installmentNumber,
      expectedAmount: event.expectedAmount.toString(),
      discountedAmount: event.discountedAmount.toString(),
      reason: event.reason,
      exceptionStatus: event.exceptionStatus,
      acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: event.acknowledgedBy,
      reviewNote: event.reviewNoteEncrypted
        ? this.protection.decrypt(event.reviewNoteEncrypted, "payroll.exception_note")
        : null,
      reviewVersion: event.reviewVersion,
      processedAt: event.processedAt.toISOString(),
      party: {
        id: event.contract.party.id,
        name: event.contract.party.tradeName ?? event.contract.party.legalName,
      },
      product: {
        id: event.contract.product.id,
        code: event.contract.product.code,
        name: event.contract.product.name,
        family: event.contract.product.family,
      },
    };
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

