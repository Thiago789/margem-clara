import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { operationalRulesSchema } from "../agreements/agreement-policy.schema.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { compareMoney, isPositiveMoney, normalizeMoney } from "../reservations/reservation-money.js";
import type { CreateContractDto } from "./contract.dto.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface ContractViewSource {
  id: string;
  agreementId: string;
  partyId: string;
  accreditationId: string;
  productId: string;
  enrollmentId: string;
  marginAccountId: string;
  policyVersionId: string;
  reservationId: string;
  contractNumber: string;
  operationType: string;
  status: string;
  contractValue: { toString(): string } | null;
  installmentAmount: { toString(): string };
  termInstallments: number | null;
  currentInstallment: number;
  cetAnnual: { toString(): string } | null;
  cetMonthly: { toString(): string } | null;
  firstDueDate: Date | null;
  firstCompetency: Date | null;
  outstandingBalance: { toString(): string } | null;
  originContractReference: string | null;
  originCreditorName: string | null;
  debtPurchaseAmount: { toString(): string } | null;
  externalReference: string | null;
  activatedAt: Date;
  settledAt: Date | null;
  createdAt: Date;
  product?: { id: string; code: string; name: string; family: string; chargeMode: string };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function parseDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} invalida`);
  }
  return parsed;
}

function parseCompetency(value: string | undefined): Date | null {
  return value ? parseDate(`${value}-01`, "Primeira competencia") : null;
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    agreementId: string,
    partyId: string,
    input: CreateContractDto,
    idempotencyKey: string | undefined,
    context: RequestContext,
  ) {
    const actorUserId = context.actor?.userId;
    if (!actorUserId) throw new UnauthorizedException();
    const key = idempotencyKey?.trim() ?? "";
    if (!IDEMPOTENCY_PATTERN.test(key)) {
      throw new BadRequestException("Idempotency-Key deve ter entre 8 e 128 caracteres seguros");
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.contract.findUnique({
            where: { agreementId_idempotencyKey: { agreementId, idempotencyKey: key } },
          });
          if (existing) {
            if (existing.partyId !== partyId) throw new ConflictException("Chave idempotente ja utilizada");
            return { ...this.view(existing), duplicate: true };
          }

          const now = new Date();
          const reservation = await transaction.marginReservation.findFirst({
            where: { id: input.reservationId, agreementId, partyId },
            include: {
              accreditation: true,
              product: true,
              enrollment: true,
              marginAccount: true,
              policyVersion: true,
              contract: true,
            },
          });
          if (!reservation) throw new NotFoundException("Reserva nao encontrada");
          if (reservation.contract || reservation.status === "CONVERTED") {
            throw new ConflictException("Reserva ja convertida em contrato");
          }
          if (reservation.status !== "ACTIVE") {
            throw new ConflictException("Somente reserva ativa pode originar contrato");
          }
          if (!reservation.expiresAt || reservation.expiresAt <= now) {
            throw new ConflictException("Reserva expirada nao pode originar contrato");
          }
          if (
            reservation.accreditation.status !== "ACTIVE" ||
            reservation.accreditation.validFrom > now ||
            (reservation.accreditation.validUntil && reservation.accreditation.validUntil < now) ||
            reservation.product.status !== "ACTIVE" ||
            reservation.enrollment.status !== "ACTIVE" ||
            reservation.marginAccount.status !== "ACTIVE"
          ) {
            throw new ConflictException("Vinculo operacional nao esta ativo para contratacao");
          }

          const policy = operationalRulesSchema.safeParse(reservation.policyVersion.payload);
          if (!policy.success) throw new ConflictException("Politica vinculada a reserva esta invalida");
          const normalized = this.validateInput(
            input,
            reservation.product.chargeMode,
            reservation.product.requiresCreditContract,
            policy.data.requiredContractFields,
          );
          const installmentAmount = reservation.amount.toString();
          if (compareMoney(installmentAmount, reservation.marginAccount.reservedAmount.toString()) > 0) {
            throw new ConflictException("Saldo reservado inconsistente para contratacao");
          }

          const contract = await transaction.contract.create({
            data: {
              agreementId,
              partyId,
              accreditationId: reservation.accreditationId,
              productId: reservation.productId,
              enrollmentId: reservation.enrollmentId,
              marginAccountId: reservation.marginAccountId,
              policyVersionId: reservation.policyVersionId,
              reservationId: reservation.id,
              contractNumber: input.contractNumber.trim().toUpperCase(),
              operationType: input.operationType,
              contractValue: normalized.contractValue,
              installmentAmount,
              termInstallments: input.termInstallments ?? null,
              cetAnnual: input.cetAnnual ?? null,
              cetMonthly: input.cetMonthly ?? null,
              firstDueDate: normalized.firstDueDate,
              firstCompetency: normalized.firstCompetency,
              outstandingBalance: normalized.outstandingBalance,
              originContractReference: input.originContractReference?.trim() || null,
              originCreditorName: input.originCreditorName?.trim() || null,
              debtPurchaseAmount: normalized.debtPurchaseAmount,
              externalReference: input.externalReference?.trim() || null,
              idempotencyKey: key,
              activatedAt: now,
              createdByUserId: actorUserId,
            },
          });

          const accountUpdated = await transaction.marginAccount.updateMany({
            where: {
              id: reservation.marginAccount.id,
              status: "ACTIVE",
              lockVersion: reservation.marginAccount.lockVersion,
              reservedAmount: { gte: installmentAmount },
            },
            data: {
              reservedAmount: { decrement: installmentAmount },
              consumedAmount: { increment: installmentAmount },
              lockVersion: { increment: 1 },
            },
          });
          if (accountUpdated.count !== 1) {
            throw new ConflictException("Saldo de margem foi alterado por outra operacao");
          }
          const availableBalance = reservation.marginAccount.availableAmount.toString();
          await transaction.marginMovement.create({
            data: {
              agreementId,
              marginAccountId: reservation.marginAccount.id,
              enrollmentId: reservation.enrollmentId,
              movementType: "CONSUMPTION",
              direction: "NO_CHANGE",
              amount: installmentAmount,
              balanceBefore: availableBalance,
              balanceAfter: availableBalance,
              sourceType: "CONTRACT",
              sourceId: contract.id,
              idempotencyKey: `contract:${contract.id}:consume`,
              correlationId: context.correlationId,
              actorUserId,
              reason: "Conversao de reserva em contrato ativo",
            },
          });
          const reservationUpdated = await transaction.marginReservation.updateMany({
            where: { id: reservation.id, status: "ACTIVE", lockVersion: reservation.lockVersion },
            data: { status: "CONVERTED", convertedAt: now, lockVersion: { increment: 1 } },
          });
          if (reservationUpdated.count !== 1) {
            throw new ConflictException("Reserva foi alterada por outra operacao");
          }
          await transaction.outboxEvent.create({
            data: {
              agreementId,
              aggregateType: "contract",
              aggregateId: contract.id,
              eventType: "contract.activated",
              payload: {
                contractId: contract.id,
                reservationId: reservation.id,
                productId: contract.productId,
                installmentAmount,
                operationType: contract.operationType,
              },
              correlationId: context.correlationId,
            },
          });
          await transaction.auditEvent.create({
            data: {
              agreementId,
              actorUserId,
              actorRole: context.actor?.role ?? null,
              actorPartyId: partyId,
              action: "contract.create_from_reservation",
              outcome: "success",
              entityType: "contract",
              entityId: contract.id,
              correlationId: context.correlationId,
              newData: {
                reservationId: reservation.id,
                operationType: contract.operationType,
                installmentAmount,
                productId: contract.productId,
                policyVersionId: contract.policyVersionId,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return { ...this.view(contract), duplicate: false };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const existing = await this.prisma.contract.findUnique({
          where: { agreementId_idempotencyKey: { agreementId, idempotencyKey: key } },
        });
        if (existing?.partyId === partyId) return { ...this.view(existing), duplicate: true };
        throw new ConflictException("Contrato, reserva ou chave idempotente ja utilizada");
      }
      if (isPrismaCode(error, "P2034")) {
        throw new ConflictException("Concorrencia detectada; repita com a mesma chave idempotente");
      }
      throw error;
    }
  }

  async list(agreementId: string, partyId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { agreementId, partyId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return contracts.map((contract) => this.view(contract));
  }

  async get(agreementId: string, partyId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, agreementId, partyId },
      include: { product: true },
    });
    if (!contract) throw new NotFoundException("Contrato nao encontrado");
    return this.view(contract);
  }

  private validateInput(
    input: CreateContractDto,
    chargeMode: string,
    requiresCreditContract: boolean,
    requiredFields: readonly string[],
  ) {
    const contractValue = input.contractValue ? normalizeMoney(input.contractValue) : null;
    const outstandingBalance = input.outstandingBalance
      ? normalizeMoney(input.outstandingBalance)
      : contractValue;
    const debtPurchaseAmount = input.debtPurchaseAmount
      ? normalizeMoney(input.debtPurchaseAmount)
      : null;
    if (contractValue && !isPositiveMoney(contractValue)) {
      throw new BadRequestException("Valor do contrato deve ser positivo");
    }
    if (requiresCreditContract && !contractValue) {
      throw new BadRequestException("Produto de credito exige o valor do contrato");
    }
    if (debtPurchaseAmount && !isPositiveMoney(debtPurchaseAmount)) {
      throw new BadRequestException("Valor de compra da divida deve ser positivo");
    }
    const firstDueDate = parseDate(input.firstDueDate, "Primeiro vencimento");
    const firstCompetency = parseCompetency(input.firstCompetency);

    if (chargeMode === "FIXED_INSTALLMENTS" && (!input.termInstallments || !firstDueDate)) {
      throw new BadRequestException("Produto parcelado exige prazo e primeiro vencimento");
    }
    if (input.operationType === "REFINANCING" && !input.originContractReference?.trim()) {
      throw new BadRequestException("Refinanciamento exige contrato de origem");
    }
    if (
      ["PORTABILITY", "DEBT_PURCHASE"].includes(input.operationType) &&
      (!input.originContractReference?.trim() || !input.originCreditorName?.trim())
    ) {
      throw new BadRequestException("Operacao exige contrato e credor de origem");
    }
    if (input.operationType === "DEBT_PURCHASE" && !debtPurchaseAmount) {
      throw new BadRequestException("Compra de divida exige o valor adquirido");
    }

    const values: Record<string, unknown> = {
      CET: input.cetAnnual,
      FIRST_DUE_DATE: firstDueDate,
      CONTRACT_VALUE: contractValue,
      FIRST_COMPETENCY: firstCompetency,
      ORIGIN_CONTRACT: input.originContractReference?.trim(),
      ORIGIN_CREDITOR: input.originCreditorName?.trim(),
      DEBT_PURCHASE_VALUE: debtPurchaseAmount,
    };
    const missing = requiredFields.filter((field) => !values[field]);
    if (missing.length) {
      throw new BadRequestException({ message: "Campos contratuais obrigatorios ausentes", fields: missing });
    }
    return { contractValue, outstandingBalance, debtPurchaseAmount, firstDueDate, firstCompetency };
  }

  private view(contract: ContractViewSource) {
    return {
      id: contract.id,
      agreementId: contract.agreementId,
      partyId: contract.partyId,
      accreditationId: contract.accreditationId,
      productId: contract.productId,
      enrollmentId: contract.enrollmentId,
      marginAccountId: contract.marginAccountId,
      policyVersionId: contract.policyVersionId,
      reservationId: contract.reservationId,
      contractNumber: contract.contractNumber,
      operationType: contract.operationType,
      status: contract.status,
      contractValue: contract.contractValue?.toString() ?? null,
      installmentAmount: contract.installmentAmount.toString(),
      termInstallments: contract.termInstallments,
      currentInstallment: contract.currentInstallment,
      cetAnnual: contract.cetAnnual?.toString() ?? null,
      cetMonthly: contract.cetMonthly?.toString() ?? null,
      firstDueDate: contract.firstDueDate?.toISOString().slice(0, 10) ?? null,
      firstCompetency: contract.firstCompetency?.toISOString().slice(0, 7) ?? null,
      outstandingBalance: contract.outstandingBalance?.toString() ?? null,
      originContractReference: contract.originContractReference,
      originCreditorName: contract.originCreditorName,
      debtPurchaseAmount: contract.debtPurchaseAmount?.toString() ?? null,
      externalReference: contract.externalReference,
      activatedAt: contract.activatedAt.toISOString(),
      settledAt: contract.settledAt?.toISOString() ?? null,
      createdAt: contract.createdAt.toISOString(),
      ...(contract.product ? { product: contract.product } : {}),
    };
  }
}
