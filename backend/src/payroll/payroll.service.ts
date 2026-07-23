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

function assertMatchingFileRequest(
  existing: {
    idempotencyKey: string;
    payrollCycleId: string;
    fileType: string;
    environment: string;
    layoutVersion: string;
    contentHash: string;
  },
  expected: {
    idempotencyKey: string;
    payrollCycleId: string;
    fileType: string;
    environment: string;
    layoutVersion: string;
    contentHash?: string;
  },
): void {
  if (existing.idempotencyKey !== expected.idempotencyKey) return;
  if (existing.payrollCycleId !== expected.payrollCycleId
    || existing.fileType !== expected.fileType
    || existing.environment !== expected.environment
    || existing.layoutVersion !== expected.layoutVersion
    || (expected.contentHash !== undefined && existing.contentHash !== expected.contentHash)) {
    throw new ConflictException("Chave idempotente reutilizada com conteudo diferente");
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
        where: { id: event.id, exó^:¶‰žËkºwµçUMM%9ˆôô¤ì(€€€€€¥˜€¡±…¥µ•¹½Õ¹Ð€„ôô€Ä¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰ÉÅÕ¥Ù¼É•Ñ½É¹¼©„•ÍÑ„•´ÁÉ½•ÍÍ…µ•¹Ñ¼ˆ¤ì(€€€€€±•Ð™Õ±°€ô€Àì(€€€€€±•ÐÁ…ÉÑ¥…°€ô€Àì(€€€€€±•ÐÉ•©•Ñ•€ô€Àì(€€€€€±•ÐÍ•ÑÑ±•€ô€Àì(€€€€€™½È€¡½¹ÍÐÉ½Ü½˜™¥±”¹É½ÝÌ¤ì(€€€€€€€½¹ÍÐÉ…Ü€ôÉ½Ü¹¹½Éµ…±¥é•‘…Ñ„…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øð¹Õ±°ì(€€€€€€€½¹ÍÐÁ…ÉÍ•€ô¹½Éµ…±¥é•‘I•ÑÕÉ¹I½ÝM¡•µ„¹Í…™•A…ÉÍ”¡É…Ü¤ì(€€€€€€€½¹ÍÐ¥¹ÍÑÉÕÑ¥½¹%€ôÑåÁ•½˜É…Üü¹¥¹ÍÑÉÕÑ¥½¹%€ôôô€‰ÍÑÉ¥¹œˆ€üÉ…Ü¹¥¹ÍÑÉÕÑ¥½¹%€è¹Õ±°ì(€€€€€€€¥˜€ …Á…ÉÍ•¹ÍÕ•ÍÌñð€…¥¹ÍÑÉÕÑ¥½¹%¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰MÑ…¥¹œ‘¼É•Ñ½É¹¼¥¹½¹Í¥ÍÑ•¹Ñ”ˆ¤ì(€€€€€€€½¹ÍÐ¥¹ÍÑÉÕÑ¥½¸€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±%¹ÍÑÉÕÑ¥½¸¹™¥¹‘¥ÉÍÐ¡ì(€€€€€€€€€Ý¡•É”èì¥è¥¹ÍÑÉÕÑ¥½¹%°…É••µ•¹Ñ%°Á…åÉ½±±å±•%èå±•%°ÍÑ…ÑÕÌè€‰9IQˆô°(€€€€€€€€€¥¹±Õ‘”èì½¹ÑÉ…Ðèì¥¹±Õ‘”èìÁÉ½‘ÕÐèÑÉÕ”°µ…É¥¹½Õ¹ÐèÑÉÕ”ôôô°(€€€€€€€ô¤ì(€€€€€€€¥˜€ …¥¹ÍÑÉÕÑ¥½¸¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰%¹ÍÑÉÕ…¼‘”‘•Í½¹Ñ¼¥¹‘¥ÍÁ½¹¥Ù•°ˆ¤ì(€€€€€€€½¹ÍÐ½¹ÑÉ…Ð€ô¥¹ÍÑÉÕÑ¥½¸¹½¹ÑÉ…Ðì(€€€€€€€¥˜€¡½¹ÑÉ…Ð¹ÍÑ…ÑÕÌ€„ôô€‰Q%Yˆ¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰½¹ÑÉ…Ñ¼¹…¼•ÍÑ„…Ñ¥Ù¼ˆ¤ì(€€€€€€€¥˜€¡¥¹ÍÑÉÕÑ¥½¸¹¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•È€„ôô¹Õ±°€˜˜¥¹ÍÑÉÕÑ¥½¸¹¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•È€„ôô½¹ÑÉ…Ð¹ÕÉÉ•¹Ñ%¹ÍÑ…±±µ•¹Ð€¬€Ä¤ì(€€€€€€€€€Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰M•ÅÕ•¹¥„‘”Á…É•±…Ì‘¼½¹ÑÉ…Ñ¼™½¤…±Ñ•É…‘„ˆ¤ì(€€€€€€€ô(€€€€€€€½¹ÍÐ•Ù•¹Ð€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥Í½Õ¹ÑÙ•¹Ð¹É•…Ñ”¡ì‘…Ñ„èì(€€€€€€€€€…É••µ•¹Ñ%°Á…åÉ½±±å±•%èå±•%°¥¹ÍÑÉÕÑ¥½¹%è¥¹ÍÑÉÕÑ¥½¸¹¥°½¹ÑÉ…Ñ%è½¹ÑÉ…Ð¹¥°(€€€€€€€€€•¹É½±±µ•¹Ñ%è¥¹ÍÑÉÕÑ¥½¸¹•¹É½±±µ•¹Ñ%°Í½ÕÉ•¥±•I½Ý%èÉ½Ü¹¥°(€€€€€€€€€•áÁ•Ñ•‘µ½Õ¹ÐèÁ…ÉÍ•¹‘…Ñ„¹•áÁ•Ñ•‘µ½Õ¹Ð°‘¥Í½Õ¹Ñ•‘µ½Õ¹ÐèÁ…ÉÍ•¹‘…Ñ„¹‘¥Í½Õ¹Ñ•‘µ½Õ¹Ð°(€€€€€€€€€½ÕÑ½µ”èÁ…ÉÍ•¹‘…Ñ„¹½ÕÑ½µ”°¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•ÈèÁ…ÉÍ•¹‘…Ñ„¹¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•È°É•…Í½¸èÁ…ÉÍ•¹‘…Ñ„¹É•…Í½¸°(€€€€€€€€€•á•ÁÑ¥½¹MÑ…ÑÕÌèÁ…ÉÍ•¹‘…Ñ„¹½ÕÑ½µ”€ôôô€‰U10ˆ€ü¹Õ±°€è€‰=A8ˆ°(€€€€€€€ôô¤ì(€€€€€€€¥˜€¡Á…ÉÍ•¹‘…Ñ„¹½ÕÑ½µ”€ôôô€‰U10ˆ¤ì(€€€€€€€€€™Õ±°€¬ô€Äì(€€€€€€€€€½¹ÍÐ‘•¥Í¥½¸€ô‘•¥‘•I•½¹¥±¥…Ñ¥½¸¡ì(€€€€€€€€€€€½ÕÑ½µ”èÁ…ÉÍ•¹‘…Ñ„¹½ÕÑ½µ”°(€€€€€€€€€€€¡…É•5½‘”è½¹ÑÉ…Ð¹ÁÉ½‘ÕÐ¹¡…É•5½‘”°(€€€€€€€€€€€ÕÉÉ•¹Ñ%¹ÍÑ…±±µ•¹Ðè½¹ÑÉ…Ð¹ÕÉÉ•¹Ñ%¹ÍÑ…±±µ•¹Ð°(€€€€€€€€€€€Ñ•Éµ%¹ÍÑ…±±µ•¹ÑÌè½¹ÑÉ…Ð¹Ñ•Éµ%¹ÍÑ…±±µ•¹ÑÌ°(€€€€€€€€€ô¤ì(€€€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹½¹ÑÉ…Ð¹ÕÁ‘…Ñ”¡ìÝ¡•É”èì¥è½¹ÑÉ…Ð¹¥ô°‘…Ñ„èì(€€€€€€€€€€€ÕÉÉ•¹Ñ%¹ÍÑ…±±µ•¹Ðè‘•¥Í¥½¸¹¹•áÑ%¹ÍÑ…±±µ•¹Ð°ÍÑ…ÑÕÌè‘•¥Í¥½¸¹Í•ÑÑ±•Í½¹ÑÉ…Ð€ü€‰MQQ1ˆ€è€‰Q%Yˆ°(€€€€€€€€€€€Í•ÑÑ±•‘Ðè‘•¥Í¥½¸¹Í•ÑÑ±•Í½¹ÑÉ…Ð€ü¹•Ü…Ñ” ¤€è¹Õ±°°Ù•ÉÍ¥½¸èì¥¹É•µ•¹Ðè€Äô°(€€€€€€€€€ôô¤ì(€€€€€€€€€¥˜€¡‘•¥Í¥½¸¹Í•ÑÑ±•Í½¹ÑÉ…Ð¤ì(€€€€€€€€€€€Í•ÑÑ±•€¬ô€Äì(€€€€€€€€€€€½¹ÍÐ…½Õ¹Ð€ô½¹ÑÉ…Ð¹µ…É¥¹½Õ¹Ðì(€€€€€€€€€€€½¹ÍÐ½¹ÍÕµ•€ô½µÁ…É•5½¹•ä¡…½Õ¹Ð¹½¹ÍÕµ•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°½¹ÑÉ…Ð¹¥¹ÍÑ…±±µ•¹Ñµ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤¤€øô€À(€€€€€€€€€€€€€€üÍÕ‰ÑÉ…Ñ5½¹•ä¡…½Õ¹Ð¹½¹ÍÕµ•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°½¹ÑÉ…Ð¹¥¹ÍÑ…±±µ•¹Ñµ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤¤(€€€€€€€€€€€€€€è€ˆÀ¸ÀÀˆì(€€€€€€€€€€€½¹ÍÐ…Ù…¥±…‰±”€ô…Ù…¥±…‰±•5½¹•ä¡…½Õ¹Ð¹Ñ½Ñ…±µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°½¹ÍÕµ•°…½Õ¹Ð¹É•Í•ÉÙ•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°…½Õ¹Ð¹‰±½­•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤¤ì(€€€€€€€€€€€½¹ÍÐÕÁ‘…Ñ•€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹µ…É¥¹½Õ¹Ð¹ÕÁ‘…Ñ•5…¹ä¡ì(€€€€€€€€€€€€€Ý¡•É”èì¥è…½Õ¹Ð¹¥°±½­Y•ÉÍ¥½¸è…½Õ¹Ð¹±½­Y•ÉÍ¥½¸ô°(€€€€€€€€€€€€€‘…Ñ„èì½¹ÍÕµ•‘µ½Õ¹Ðè½¹ÍÕµ•°…Ù…¥±…‰±•µ½Õ¹Ðè…Ù…¥±…‰±”°±½­Y•ÉÍ¥½¸èì¥¹É•µ•¹Ðè€Äôô°(€€€€€€€€€€€ô¤ì(€€€€€€€€€€€¥˜€¡ÕÁ‘…Ñ•¹½Õ¹Ð€„ôô€Ä¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰5…É•´™½¤…±Ñ•É…‘„‘ÕÉ…¹Ñ”„±¥ÅÕ¥‘……¼ˆ¤ì(€€€€€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹µ…É¥¹5½Ù•µ•¹Ð¹É•…Ñ”¡ì‘…Ñ„èì(€€€€€€€€€€€€€…É••µ•¹Ñ%°µ…É¥¹½Õ¹Ñ%è…½Õ¹Ð¹¥°•¹É½±±µ•¹Ñ%è¥¹ÍÑÉÕÑ¥½¸¹•¹É½±±µ•¹Ñ%°(€€€€€€€€€€€€€µ½Ù•µ•¹ÑQåÁ”è€‰I1Mˆ°‘¥É•Ñ¥½¸è½µÁ…É•5½¹•ä¡…Ù…¥±…‰±”°…½Õ¹Ð¹…Ù…¥±…‰±•µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤¤€ø€À€ü€‰%9IMˆ€è€‰9=}!9ˆ°(€€€€€€€€€€€€€…µ½Õ¹Ðè½¹ÑÉ…Ð¹¥¹ÍÑ…±±µ•¹Ñµ½Õ¹Ð°‰…±…¹•	•™½É”è…½Õ¹Ð¹…Ù…¥±…‰±•µ½Õ¹Ð°‰…±…¹•™Ñ•Èè…Ù…¥±…‰±”°(€€€€€€€€€€€€€Í½ÕÉ•QåÁ”è€‰Á…åÉ½±±}‘¥Í½Õ¹Ñ}•Ù•¹Ðˆ°Í½ÕÉ•%è•Ù•¹Ð¹¥°(€€€€€€€€€€€€€¥‘•µÁ½Ñ•¹å-•äèÁ…åÉ½±°µÍ•ÑÑ±•µ•¹Ðè‘í•Ù•¹Ð¹¥‘õ€°½ÉÉ•±…Ñ¥½¹%è½¹Ñ•áÐ¹½ÉÉ•±…Ñ¥½¹%°(€€€€€€€€€€€€€…Ñ½ÉUÍ•É%è½¹Ñ•áÐ¹…Ñ½Èü¹ÕÍ•É%€üü¹Õ±°°É•…Í½¸è€‰1¥ÅÕ¥‘……¼…ÕÑ½µ…Ñ¥„¹„Õ±Ñ¥µ„Á…É•±„‘•Í½¹Ñ…‘„ˆ°(€€€€€€€€€€€ôô¤ì(€€€€€€€€€ô(€€€€€€€ô•±Í”¥˜€¡Á…ÉÍ•¹‘…Ñ„¹½ÕÑ½µ”€ôôô€‰AIQ%0ˆ¤Á…ÉÑ¥…°€¬ô€Äì(€€€€€€€•±Í”É•©•Ñ•€¬ô€Äì(€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±%¹ÍÑÉÕÑ¥½¸¹ÕÁ‘…Ñ”¡ìÝ¡•É”èì¥è¥¹ÍÑÉÕÑ¥½¸¹¥ô°‘…Ñ„èìÍÑ…ÑÕÌè€‰I=9%1ˆ°É•½¹¥±•‘Ðè¹•Ü…Ñ” ¤ôô¤ì(€€€€€ô(€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±•I½Ü¹ÕÁ‘…Ñ•5…¹ä¡ìÝ¡•É”èìÁ…åÉ½±±¥±•%è™¥±•%°ÍÑ…ÑÕÌè€‰Y1%ˆô°‘…Ñ„èìÍÑ…ÑÕÌè€‰AA1%ˆôô¤ì(€€€€€½¹ÍÐ…ÁÁ±¥•€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±”¹ÕÁ‘…Ñ”¡ìÝ¡•É”èì¥è™¥±•%ô°‘…Ñ„èìÍÑ…ÑÕÌè€‰AA1%ˆ°ÁÉ½•ÍÍ•‘	åUÍ•É%è½¹Ñ•áÐ¹…Ñ½È„¹ÕÍ•É%°ÁÉ½•ÍÍ•‘Ðè¹•Ü…Ñ” ¤ôô¤ì(€€€€€½¹ÍÐÁ•¹‘¥¹œ€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±%¹ÍÑÉÕÑ¥½¸¹½Õ¹Ð¡ìÝ¡•É”èìÁ…åÉ½±±å±•%èå±•%°ÍÑ…ÑÕÌè€‰9IQˆôô¤ì(€€€€€¥˜€¡Á•¹‘¥¹œ€ôôô€À¤…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±å±”¹ÕÁ‘…Ñ”¡ìÝ¡•É”èì¥èå±•%ô°‘…Ñ„èìÍÑ…ÑÕÌè€‰1=Mˆ°±½Í•‘	åUÍ•É%è½¹Ñ•áÐ¹…Ñ½È„¹ÕÍ•É%°±½Í•‘Ðè¹•Ü…Ñ” ¤°Ù•ÉÍ¥½¸èì¥¹É•µ•¹Ðè€Äôôô¤ì(€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹…Õ‘¥ÑÙ•¹Ð¹É•…Ñ”¡ì‘…Ñ„èì(€€€€€€€…É••µ•¹Ñ%°…Ñ½ÉUÍ•É%è½¹Ñ•áÐ¹…Ñ½Èü¹ÕÍ•É%€üü¹Õ±°°…Ñ½ÉI½±”è½¹Ñ•áÐ¹…Ñ½Èü¹É½±”€üü¹Õ±°°(€€€€€€€…Ñ¥½¸è€‰Á…åÉ½±±}É•ÑÕÉ¹}™¥±”¹…ÁÁ±äˆ°½ÕÑ½µ”è€‰ÍÕ•ÍÌˆ°•¹Ñ¥ÑåQåÁ”è€‰Á…åÉ½±±}™¥±”ˆ°•¹Ñ¥Ñå%è™¥±•%°(€€€€€€€½ÉÉ•±…Ñ¥½¹%è½¹Ñ•áÐ¹½ÉÉ•±…Ñ¥½¹%°¹•Ý…Ñ„èì™Õ±°°Á…ÉÑ¥…°°É•©•Ñ•°Í•ÑÑ±•°Á•¹‘¥¹%¹ÍÑÉÕÑ¥½¹ÌèÁ•¹‘¥¹œô°(€€€€€€€¥Á‘‘É•ÍÌè½¹Ñ•áÐ¹¥Á‘‘É•ÍÌ°ÕÍ•É•¹Ðè½¹Ñ•áÐ¹ÕÍ•É•¹Ð°(€€€€€ôô¤ì(€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹½ÕÑ‰½áÙ•¹Ð¹É•…Ñ”¡ì‘…Ñ„èì(€€€€€€€…É••µ•¹Ñ%°…É•…Ñ•QåÁ”è€‰Á…åÉ½±±}™¥±”ˆ°…É•…Ñ•%è™¥±•%°(€€€€€€€•Ù•¹ÑQåÁ”è€‰Á…åÉ½±°¹É•ÑÕÉ¹}…ÁÁ±¥•ˆ°(€€€€€€€Á…å±½…èìÁ…åÉ½±±¥±•%è™¥±•%°Á…åÉ½±±å±•%èå±•%°™Õ±°°Á…ÉÑ¥…°°É•©•Ñ•°Í•ÑÑ±•°Á•¹‘¥¹%¹ÍÑÉÕÑ¥½¹ÌèÁ•¹‘¥¹œô°(€€€€€€€½ÉÉ•±…Ñ¥½¹%è½¹Ñ•áÐ¹½ÉÉ•±…Ñ¥½¹%°(€€€€€ôô¤ì(€€€€€É•ÑÕÉ¸ì€¸¸¹Ñ¡¥Ì¹Ñ½¥±•Y¥•Ü¡…ÁÁ±¥•¤°‘ÕÁ±¥…Ñ”è™…±Í”°É•½¹¥±¥…Ñ¥½¸èì™Õ±°°Á…ÉÑ¥…°°É•©•Ñ•°Í•ÑÑ±•°Á•¹‘¥¹œôôì(€€€ô°ì¥Í½±…Ñ¥½¹1•Ù•°è€‰M•É¥…±¥é…‰±”ˆô¤ì(€ô((€…Íå¹Œ•Ñ¥±”¡…É••µ•¹Ñ%èÍÑÉ¥¹œ°å±•%èÍÑÉ¥¹œ°™¥±•%èÍÑÉ¥¹œ¤ì(€€€½¹ÍÐ™¥±”€ô…Ý…¥ÐÑ¡¥Ì¹ÁÉ¥Íµ„¹Á…åÉ½±±¥±”¹™¥¹‘¥ÉÍÐ¡ì(€€€€€Ý¡•É”èì¥è™¥±•%°…É••µ•¹Ñ%°Á…åÉ½±±å±•%èå±•%ô°(€€€€€¥¹±Õ‘”èì(€€€€€€€É½ÝÌèì(€€€€€€€€€Í•±•Ðèì(€€€€€€€€€€€¥èÑÉÕ”°(€€€€€€€€€€€É½Ý9Õµ‰•ÈèÑÉÕ”°(€€€€€€€€€€€ÍÑ…ÑÕÌèÑÉÕ”°(€€€€€€€€€€€…µ½Õ¹ÐèÑÉÕ”°(€€€€€€€€€€€¹½Éµ…±¥é•‘…Ñ„èÑÉÕ”°(€€€€€€€€€€€•ÉÉ½ÉÌèÑÉÕ”°(€€€€€€€€€ô°(€€€€€€€€€½É‘•É	äèìÉ½Ý9Õµ‰•Èè€‰…ÍŒˆô°(€€€€€€€€€Ñ…­”è€ÄÁ|ÀÀÀ°(€€€€€€€ô°(€€€€€ô°(€€€ô¤ì(€€€¥˜€ …™¥±”¤Ñ¡É½Ü¹•Ü9½Ñ½Õ¹‘á•ÁÑ¥½¸ ‰ÉÅÕ¥Ù¼‘”™½±¡„¹…¼•¹½¹ÑÉ…‘¼ˆ¤ì(€€€É•ÑÕÉ¸ì(€€€€€€¸¸¹Ñ¡¥Ì¹Ñ½¥±•Y¥•Ü¡™¥±”¤°(€€€€€É½ÝÌè™¥±”¹É½ÝÌ¹µ…À ¡É½Ü¤€ôø€¡ì€¸¸¹É½Ü°…µ½Õ¹ÐèÉ½Ü¹…µ½Õ¹Ðü¹Ñ½MÑÉ¥¹œ ¤€üü¹Õ±°ô¤¤°(€€€ôì(€ô((€…Íå¹ŒÁÕ‰±¥Í¡5…É¥¹¥±” (€€€…É••µ•¹Ñ%èÍÑÉ¥¹œ°(€€€å±•%èÍÑÉ¥¹œ°(€€€™¥±•%èÍÑÉ¥¹œ°(€€€½¹Ñ•áÐèI•ÅÕ•ÍÑ½¹Ñ•áÐ°(€€¤ì(€€€É•ÑÕÉ¸Ñ¡¥Ì¹ÁÉ¥Íµ„¸‘ÑÉ…¹Í…Ñ¥½¸ (€€€€€…Íå¹Œ€¡ÑÉ…¹Í…Ñ¥½¸¤€ôøì(€€€€€€€½¹ÍÐ™¥±”€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±”¹™¥¹‘¥ÉÍÐ¡ì(€€€€€€€€€Ý¡•É”èì¥è™¥±•%°…É••µ•¹Ñ%°Á…åÉ½±±å±•%èå±•%°™¥±•QåÁ”è€‰5I%8ˆô°(€€€€€€€€€¥¹±Õ‘”èìÉ½ÝÌèìÝ¡•É”èìÍÑ…ÑÕÌè€‰Y1%ˆô°½É‘•É	äèìÉ½Ý9Õµ‰•Èè€‰…ÍŒˆôôô°(€€€€€€€ô¤ì(€€€€€€€¥˜€ …™¥±”¤Ñ¡É½Ü¹•Ü9½Ñ½Õ¹‘á•ÁÑ¥½¸ ‰ÉÅÕ¥Ù¼‘”µ…É•´¹…¼•¹½¹ÑÉ…‘¼ˆ¤ì(€€€€€€€¥˜€¡™¥±”¹ÍÑ…ÑÕÌ€ôôô€‰AA1%ˆ¤É•ÑÕÉ¸ì€¸¸¹Ñ¡¥Ì¹Ñ½¥±•Y¥•Ü¡™¥±”¤°‘ÕÁ±¥…Ñ”èÑÉÕ”ôì(€€€€€€€¥˜€¡™¥±”¹ÍÑ…ÑÕÌ€„ôô€‰Y1%Qˆñð™¥±”¹¥¹Ù…±¥‘I½ÝÌ€ø€À¤ì(€€€€€€€€€Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰ÉÅÕ¥Ù¼¹…¼•ÍÑ„Ù…±¥‘…‘¼Á…É„ÁÕ‰±¥……¼ˆ¤ì(€€€€€€€ô(€€€€€€€½¹ÍÐ±…¥µ•€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±”¹ÕÁ‘…Ñ•5…¹ä¡ì(€€€€€€€€€Ý¡•É”èì¥è™¥±•%°ÍÑ…ÑÕÌè€‰Y1%Qˆô°(€€€€€€€€€‘…Ñ„èìÍÑ…ÑÕÌè€‰AI=MM%9ˆô°(€€€€€€€ô¤ì(€€€€€€€¥˜€¡±…¥µ•¹½Õ¹Ð€„ôô€Ä¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰ÉÅÕ¥Ù¼©„•ÍÑ„•´ÁÉ½•ÍÍ…µ•¹Ñ¼ˆ¤ì((€€€€€€€™½È€¡½¹ÍÐÉ½Ü½˜™¥±”¹É½ÝÌ¤ì(€€€€€€€€€¥˜€ …É½Ü¹•¹É½±±µ•¹Ñ%¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰1¥¹¡„Ù…±¥‘„Í•´µ…ÑÉ¥Õ±„Ù¥¹Õ±…‘„ˆ¤ì(€€€€€€€€€½¹ÍÐÁ…ÉÍ•€ô¹½Éµ…±¥é•‘5…É¥¹I½ÝM¡•µ„¹½µ¥Ð¡ì•¹É½±±µ•¹Ñ9Õµ‰•ÈèÑÉÕ”ô¤¹Í…™•A…ÉÍ” (€€€€€€€€€€€É½Ü¹¹½Éµ…±¥é•‘…Ñ„°(€€€€€€€€€€¤ì(€€€€€€€€€¥˜€ …Á…ÉÍ•¹ÍÕ•ÍÌ¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰MÑ…¥¹œ‘”µ…É•´¥¹½¹Í¥ÍÑ•¹Ñ”ˆ¤ì(€€€€€€€€€½¹ÍÐÕÉÉ•¹Ð€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹•¹É½±±µ•¹Ð¹™¥¹‘¥ÉÍÐ¡ì(€€€€€€€€€€€Ý¡•É”èì¥èÉ½Ü¹•¹É½±±µ•¹Ñ%°…É••µ•¹Ñ%ô°(€€€€€€€€€ô¤ì(€€€€€€€€€¥˜€ …ÕÉÉ•¹Ð¤Ñ¡É½Ü¹•Ü½¹™±¥Ñá•ÁÑ¥½¸ ‰5…ÑÉ¥Õ±„‘¼ÍÑ…¥¹œ¹…¼•ÍÑ„‘¥ÍÁ½¹¥Ù•°ˆ¤ì(€€€€€€€€€½¹ÍÐ…™Ñ•É…Ñ„€ôÁ…ÉÍ•¹‘…Ñ„ì(€€€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹•¹É½±±µ•¹ÑA…åÉ½±±M¹…ÁÍ¡½Ð¹É•…Ñ”¡ì(€€€€€€€€€€€‘…Ñ„èì(€€€€€€€€€€€€€…É••µ•¹Ñ%°(€€€€€€€€€€€€€Á…åÉ½±±å±•%èå±•%°(€€€€€€€€€€€€€•¹É½±±µ•¹Ñ%èÕÉÉ•¹Ð¹¥°(€€€€€€€€€€€€€Í½ÕÉ•¥±•I½Ý%èÉ½Ü¹¥°(€€€€€€€€€€€€€‰•™½É•…Ñ„èì(€€€€€€€€€€€€€€€™Õ¹Ñ¥½¹…±MÑ…ÑÕÌèÕÉÉ•¹Ð¹™Õ¹Ñ¥½¹…±MÑ…ÑÕÌ°(€€€€€€€€€€€€€€€•µÁ±½åµ•¹ÑQåÁ”èÕÉÉ•¹Ð¹•µÁ±½åµ•¹ÑQåÁ”°(€€€€€€€€€€€€€€€Á…åÉ½±±É½ÕÀèÕÉÉ•¹Ð¹Á…åÉ½±±É½ÕÀ°(€€€€€€€€€€€€€€€‘•Á…ÉÑµ•¹ÐèÕÉÉ•¹Ð¹‘•Á…ÉÑµ•¹Ð°(€€€€€€€€€€€€€€€½ÍÑ•¹Ñ•ÈèÕÉÉ•¹Ð¹½ÍÑ•¹Ñ•È°(€€€€€€€€€€€€€€€‰…Í•M…±…ÉäèÕÉÉ•¹Ð¹‰…Í•M…±…Éä¹Ñ½MÑÉ¥¹œ ¤°(€€€€€€€€€€€€€€€µ…¹‘…Ñ½Éå•‘ÕÑ¥½¹ÌèÕÉÉ•¹Ð¹µ…¹‘…Ñ½Éå•‘ÕÑ¥½¹Ì¹Ñ½MÑÉ¥¹œ ¤°(€€€€€€€€€€€€€€€µ…É¥¹	…Í”èÕÉÉ•¹Ð¹µ…É¥¹	…Í”¹Ñ½MÑÉ¥¹œ ¤°(€€€€€€€€€€€€€€€Í½ÕÉ•UÁ‘…Ñ•‘Ðè‘…Ñ•Y…±Õ”¡ÕÉÉ•¹Ð¹Í½ÕÉ•UÁ‘…Ñ•‘Ð¤°(€€€€€€€€€€€€€€€Ù•ÉÍ¥½¸èÕÉÉ•¹Ð¹Ù•ÉÍ¥½¸°(€€€€€€€€€€€€€ô°(€€€€€€€€€€€€€…™Ñ•É…Ñ„°(€€€€€€€€€€€ô°(€€€€€€€€€ô¤ì(€€€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹•¹É½±±µ•¹Ð¹ÕÁ‘…Ñ”¡ì(€€€€€€€€€€€Ý¡•É”èì¥èÕÉÉ•¹Ð¹¥ô°(€€€€€€€€€€€‘…Ñ„èì(€€€€€€€€€€€€€™Õ¹Ñ¥½¹…±MÑ…ÑÕÌè…™Ñ•É…Ñ„¹™Õ¹Ñ¥½¹…±MÑ…ÑÕÌ°(€€€€€€€€€€€€€•µÁ±½åµ•¹ÑQåÁ”è…™Ñ•É…Ñ„¹•µÁ±½åµ•¹ÑQåÁ”°(€€€€€€€€€€€€€Á…åÉ½±±É½ÕÀè…™Ñ•É…Ñ„¹Á…åÉ½±±É½ÕÀ°(€€€€€€€€€€€€€‘•Á…ÉÑµ•¹Ðè…™Ñ•É…Ñ„¹‘•Á…ÉÑµ•¹Ð°(€€€€€€€€€€€€€½ÍÑ•¹Ñ•Èè…™Ñ•É…Ñ„¹½ÍÑ•¹Ñ•È°(€€€€€€€€€€€€€‰…Í•M…±…Éäè…™Ñ•É…Ñ„¹‰…Í•M…±…Éä°(€€€€€€€€€€€€€µ…¹‘…Ñ½Éå•‘ÕÑ¥½¹Ìè…™Ñ•É…Ñ„¹µ…¹‘…Ñ½Éå•‘ÕÑ¥½¹Ì°(€€€€€€€€€€€€€µ…É¥¹	…Í”è…™Ñ•É…Ñ„¹µ…É¥¹	…Í”°(€€€€€€€€€€€€€Í½ÕÉ•UÁ‘…Ñ•‘Ðè…™Ñ•É…Ñ„¹Í½ÕÉ•UÁ‘…Ñ•‘Ð(€€€€€€€€€€€€€€€€ü¹•Ü…Ñ”¡…™Ñ•É…Ñ„¹Í½ÕÉ•UÁ‘…Ñ•‘Ð¤(€€€€€€€€€€€€€€€€è¹•Ü…Ñ” ¤°(€€€€€€€€€€€€€Ù•ÉÍ¥½¸èì¥¹É•µ•¹Ðè€Äô°(€€€€€€€€€€€ô°(€€€€€€€€€ô¤ì(€€€€€€€ô((€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±•I½Ü¹ÕÁ‘…Ñ•5…¹ä¡ì(€€€€€€€€€Ý¡•É”èìÁ…åÉ½±±¥±•%è™¥±•%°ÍÑ…ÑÕÌè€‰Y1%ˆô°(€€€€€€€€€‘…Ñ„èìÍÑ…ÑÕÌè€‰AA1%ˆô°(€€€€€€€ô¤ì(€€€€€€€½¹ÍÐ…ÁÁ±¥•€ô…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±¥±”¹ÕÁ‘…Ñ”¡ì(€€€€€€€€€Ý¡•É”èì¥è™¥±•%ô°(€€€€€€€€€‘…Ñ„èì(€€€€€€€€€€€ÍÑ…ÑÕÌè€‰AA1%ˆ°(€€€€€€€€€€€ÁÉ½•ÍÍ•‘	åUÍ•É%è½¹Ñ•áÐ¹…Ñ½È„¹ÕÍ•É%°(€€€€€€€€€€€ÁÉ½•ÍÍ•‘Ðè¹•Ü…Ñ” ¤°(€€€€€€€€€ô°(€€€€€€€ô¤ì(€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹Á…åÉ½±±å±”¹ÕÁ‘…Ñ”¡ì(€€€€€€€€€Ý¡•É”èì¥èå±•%ô°(€€€€€€€€€‘…Ñ„èìÍÑ…ÑÕÌè€‰AU	1%M!ˆ°Ù•ÉÍ¥½¸èì¥¹É•µ•¹Ðè€Äôô°(€€€€€€€ô¤ì(€€€€€€€…Ý…¥ÐÑÉ…¹Í…Ñ¥½¸¹…Õ‘¥ÑÙ•¹Ð¹É•…Ñ”¡ì(€€€€€€€€€‘…Ñ„èì(€€€€€€€€€€€…É••µ•¹Ñ%°(€€€€€€€€€€€…Ñ½ÉUÍ•É%è½¹Ñ•áÐ¹…Ñ½Èü¹ÕÍ•É%€üü¹Õ±°°(€€€€€€€€€€€…Ñ½ÉI½±”è½¹Ñ•áÐ¹…Ñ½Èü¹É½±”€üü¹Õ±°°(€€€€€€€€€€€…Ñ¥½¸è€‰Á…åÉ½±±}µ…É¥¹}™¥±”¹ÁÕ‰±¥Í ˆ°(€€€€€€€€€€€½ÕÑ½µ”è€‰ÍÕ•ÍÌˆ°(€€€€€€€€€€€•¹Ñ¥ÑåQåÁ”è€‰Á…åÉ½±±}™¥±”ˆ°(€€€€€€€€€€€•¹Ñ¥Ñå%è™¥±•%°(€€€€€€€€€€€½ÉÉ•±…Ñ¥½¹%è½¹Ñ•áÐ¹½ÉÉ•±…Ñ¥½¹%°(€€€€€€€€€€€¹•Ý…Ñ„èìÁÉ½Ñ½½±9Õµ‰•Èè™¥±”¹ÁÉ½Ñ½½±9Õµ‰•È°…ÁÁ±¥•‘I½ÝÌè™¥±”¹Ù…±¥‘I½ÝÌô°(€€€€€€€€€€€¥Á‘‘É•ÍÌè½¹Ñ•áÐ¹¥Á‘‘É•ÍÌ°(€€€€€€€€€€€ÕÍ•É•¹Ðè½¹Ñ•áÐ¹ÕÍ•É•¹Ð°(€€€€€€€€€ô°(€€€€€€€ô¤ì(€€€€€€€É•ÑÕÉ¸ì€¸¸¹Ñ¡¥Ì¹Ñ½¥±•Y¥•Ü¡…ÁÁ±¥•¤°‘ÕÁ±¥…Ñ”è™…±Í”ôì(€€€€€ô°(€€€€€ì¥Í½±…Ñ¥½¹1•Ù•°è€‰M•É¥…±¥é…‰±”ˆô°(€€€€¤ì(€ô((€ÁÉ¥Ù…Ñ”•á•ÁÑ¥½¹Y¥•Ü¡•Ù•¹Ðèì(€€€¥èÍÑÉ¥¹œì(€€€½¹ÑÉ…Ñ%èÍÑÉ¥¹œì(€€€½ÕÑ½µ”èÍÑÉ¥¹œì(€€€¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•Èè¹Õµ‰•Èð¹Õ±°ì(€€€•áÁ•Ñ•‘µ½Õ¹ÐèìÑ½MÑÉ¥¹œ ¤èÍÑÉ¥¹œôì(€€€‘¥Í½Õ¹Ñ•‘µ½Õ¹ÐèìÑ½MÑÉ¥¹œ ¤èÍÑÉ¥¹œôì(€€€É•…Í½¸èÍÑÉ¥¹œð¹Õ±°ì(€€€•á•ÁÑ¥½¹MÑ…ÑÕÌèÍÑÉ¥¹œð¹Õ±°ì(€€€…­¹½Ý±•‘•‘Ðè…Ñ”ð¹Õ±°ì(€€€…­¹½Ý±•‘•‘	äèì¥èÍÑÉ¥¹œì¹…µ”èÍÑÉ¥¹œôð¹Õ±°ì(€€€É•Ù¥•Ý9½Ñ•¹ÉåÁÑ•èÍÑÉ¥¹œð¹Õ±°ì(€€€É•Ù¥•ÝY•ÉÍ¥½¸è¹Õµ‰•Èì(€€€ÁÉ½•ÍÍ•‘Ðè…Ñ”ì(€€€½¹ÑÉ…Ðèì(€€€€€½¹ÑÉ…Ñ9Õµ‰•ÈèÍÑÉ¥¹œì(€€€€€Á…ÉÑäèì¥èÍÑÉ¥¹œìÑÉ…‘•9…µ”èÍÑÉ¥¹œð¹Õ±°ì±•…±9…µ”èÍÑÉ¥¹œôì(€€€€€ÁÉ½‘ÕÐèì¥èÍÑÉ¥¹œì½‘”èÍÑÉ¥¹œì¹…µ”èÍÑÉ¥¹œì™…µ¥±äèÍÑÉ¥¹œôì(€€€ôì(€ô¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥è•Ù•¹Ð¹¥°(€€€€€½¹ÑÉ…Ñ%è•Ù•¹Ð¹½¹ÑÉ…Ñ%°(€€€€€½¹ÑÉ…Ñ9Õµ‰•Èè•Ù•¹Ð¹½¹ÑÉ…Ð¹½¹ÑÉ…Ñ9Õµ‰•È°(€€€€€½ÕÑ½µ”è•Ù•¹Ð¹½ÕÑ½µ”°(€€€€€¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•Èè•Ù•¹Ð¹¥¹ÍÑ…±±µ•¹Ñ9Õµ‰•È°(€€€€€•áÁ•Ñ•‘µ½Õ¹Ðè•Ù•¹Ð¹•áÁ•Ñ•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°(€€€€€‘¥Í½Õ¹Ñ•‘µ½Õ¹Ðè•Ù•¹Ð¹‘¥Í½Õ¹Ñ•‘µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°(€€€€€É•…Í½¸è•Ù•¹Ð¹É•…Í½¸°(€€€€€•á•ÁÑ¥½¹MÑ…ÑÕÌè•Ù•¹Ð¹•á•ÁÑ¥½¹MÑ…ÑÕÌ°(€€€€€…­¹½Ý±•‘•‘Ðè•Ù•¹Ð¹…­¹½Ý±•‘•‘Ðü¹Ñ½%M=MÑÉ¥¹œ ¤€üü¹Õ±°°(€€€€€…­¹½Ý±•‘•‘	äè•Ù•¹Ð¹…­¹½Ý±•‘•‘	ä°(€€€€€É•Ù¥•Ý9½Ñ”è•Ù•¹Ð¹É•Ù¥•Ý9½Ñ•¹ÉåÁÑ•(€€€€€€€€üÑ¡¥Ì¹ÁÉ½Ñ•Ñ¥½¸¹‘•ÉåÁÐ¡•Ù•¹Ð¹É•Ù¥•Ý9½Ñ•¹ÉåÁÑ•°€‰Á…åÉ½±°¹•á•ÁÑ¥½¹}¹½Ñ”ˆ¤(€€€€€€€€è¹Õ±°°(€€€€€É•Ù¥•ÝY•ÉÍ¥½¸è•Ù•¹Ð¹É•Ù¥•ÝY•ÉÍ¥½¸°(€€€€€ÁÉ½•ÍÍ•‘Ðè•Ù•¹Ð¹ÁÉ½•ÍÍ•‘Ð¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€Á…ÉÑäèì(€€€€€€€¥è•Ù•¹Ð¹½¹ÑÉ…Ð¹Á…ÉÑä¹¥°(€€€€€€€¹…µ”è•Ù•¹Ð¹½¹ÑÉ…Ð¹Á…ÉÑä¹ÑÉ…‘•9…µ”€üü•Ù•¹Ð¹½¹ÑÉ…Ð¹Á…ÉÑä¹±•…±9…µ”°(€€€€€ô°(€€€€€ÁÉ½‘ÕÐèì(€€€€€€€¥è•Ù•¹Ð¹½¹ÑÉ…Ð¹ÁÉ½‘ÕÐ¹¥°(€€€€€€€½‘”è•Ù•¹Ð¹½¹ÑÉ…Ð¹ÁÉ½‘ÕÐ¹½‘”°(€€€€€€€¹…µ”è•Ù•¹Ð¹½¹ÑÉ…Ð¹ÁÉ½‘ÕÐ¹¹…µ”°(€€€€€€€™…µ¥±äè•Ù•¹Ð¹½¹ÑÉ…Ð¹ÁÉ½‘ÕÐ¹™…µ¥±ä°(€€€€€ô°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”Ñ½å±•Y¥•Ü¡å±”èì(€€€¥èÍÑÉ¥¹œì(€€€…É••µ•¹Ñ%èÍÑÉ¥¹œì(€€€½µÁ•Ñ•¹äè…Ñ”ì(€€€ÕÑ½™™Ðè…Ñ”ì(€€€¥¹Í•ÉÑ¥½¹Õ•Ðè…Ñ”ð¹Õ±°ì(€€€É•ÑÕÉ¹Õ•Ðè…Ñ”ð¹Õ±°ì(€€€ÍÑ…ÑÕÌèÍÑÉ¥¹œì(€€€Á½±¥åY•ÉÍ¥½¹%èÍÑÉ¥¹œð¹Õ±°ì(€€€Ù•ÉÍ¥½¸è¹Õµ‰•Èì(€ô¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥èå±”¹¥°(€€€€€…É••µ•¹Ñ%èå±”¹…É••µ•¹Ñ%°(€€€€€½µÁ•Ñ•¹äèå±”¹½µÁ•Ñ•¹ä¹Ñ½%M=MÑÉ¥¹œ ¤¹Í±¥” À°€Ü¤°(€€€€€ÕÑ½™™Ðèå±”¹ÕÑ½™™Ð¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€¥¹Í•ÉÑ¥½¹Õ•Ðè‘…Ñ•Y…±Õ”¡å±”¹¥¹Í•ÉÑ¥½¹Õ•Ð¤°(€€€€€É•ÑÕÉ¹Õ•Ðè‘…Ñ•Y…±Õ”¡å±”¹É•ÑÕÉ¹Õ•Ð¤°(€€€€€ÍÑ…ÑÕÌèå±”¹ÍÑ…ÑÕÌ°(€€€€€Á½±¥åY•ÉÍ¥½¹%èå±”¹Á½±¥åY•ÉÍ¥½¹%°(€€€€€Ù•ÉÍ¥½¸èå±”¹Ù•ÉÍ¥½¸°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”Ñ½¥±•Y¥•Ü¡™¥±”èì(€€€¥èÍÑÉ¥¹œì(€€€…É••µ•¹Ñ%èÍÑÉ¥¹œì(€€€Á…åÉ½±±å±•%èÍÑÉ¥¹œì(€€€ÁÉ½Ñ½½±9Õµ‰•ÈèÍÑÉ¥¹œì(€€€½É¥¥¹…±¥±•9…µ”èÍÑÉ¥¹œì(€€€±…å½ÕÑY•ÉÍ¥½¸èÍÑÉ¥¹œì(€€€•¹Ù¥É½¹µ•¹ÐèÍÑÉ¥¹œì(€€€ÍÑ…ÑÕÌèÍÑÉ¥¹œì(€€€Ñ½Ñ…±I½ÝÌè¹Õµ‰•Èì(€€€Ù…±¥‘I½ÝÌè¹Õµ‰•Èì(€€€¥¹Ù…±¥‘I½ÝÌè¹Õµ‰•Èì(€€€Ñ½Ñ…±µ½Õ¹ÐèìÑ½MÑÉ¥¹œ ¤èÍÑÉ¥¹œôì(€€€Í¥é•	åÑ•Ìè‰¥¥¹Ðì(€€€É•…Ñ•‘Ðè…Ñ”ì(€€€ÁÉ½•ÍÍ•‘Ðè…Ñ”ð¹Õ±°ì(€ô¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥è™¥±”¹¥°(€€€€€…É••µ•¹Ñ%è™¥±”¹…É••µ•¹Ñ%°(€€€€€Á…åÉ½±±å±•%è™¥±”¹Á…åÉ½±±å±•%°(€€€€€ÁÉ½Ñ½½±9Õµ‰•Èè™¥±”¹ÁÉ½Ñ½½±9Õµ‰•È°(€€€€€½É¥¥¹…±¥±•9…µ”è™¥±”¹½É¥¥¹…±¥±•9…µ”°(€€€€€±…å½ÕÑY•ÉÍ¥½¸è™¥±”¹±…å½ÕÑY•ÉÍ¥½¸°(€€€€€•¹Ù¥É½¹µ•¹Ðè™¥±”¹•¹Ù¥É½¹µ•¹Ð°(€€€€€ÍÑ…ÑÕÌè™¥±”¹ÍÑ…ÑÕÌ°(€€€€€Ñ½Ñ…±I½ÝÌè™¥±”¹Ñ½Ñ…±I½ÝÌ°(€€€€€Ù…±¥‘I½ÝÌè™¥±”¹Ù…±¥‘I½ÝÌ°(€€€€€¥¹Ù…±¥‘I½ÝÌè™¥±”¹¥¹Ù…±¥‘I½ÝÌ°(€€€€€Ñ½Ñ…±µ½Õ¹Ðè™¥±”¹Ñ½Ñ…±µ½Õ¹Ð¹Ñ½MÑÉ¥¹œ ¤°(€€€€€Í¥é•	åÑ•Ìè™¥±”¹Í¥é•	åÑ•Ì¹Ñ½MÑÉ¥¹œ ¤°(€€€€€É•…Ñ•‘Ðè™¥±”¹É•…Ñ•‘Ð¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ÁÉ½•ÍÍ•‘Ðè‘…Ñ•Y…±Õ”¡™¥±”¹ÁÉ½•ÍÍ•‘Ð¤°(€€€ôì(€ô)ô