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
import {
  normalizedMarginRowSchema,
  parseMarginFile,
  type NormalizedMarginRow,
} from "./margin-file.parser.js";
import type {
  CreatePayrollCycleDto,
  MarginFileMetadataDto,
  UploadedMarginFile,
} from "./payroll.dto.js";

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
