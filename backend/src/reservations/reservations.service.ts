import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { operationalRulesSchema } from "../agreements/agreement-policy.schema.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { ReservationCodeService } from "./reservation-code.service.js";
import type { CreateReservationDto } from "./reservation.dto.js";
import {
  availableMoney,
  compareMoney,
  isPositiveMoney,
  normalizeMoney,
  subtractMoney,
} from "./reservation-money.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface ReservationViewSource {
  id: string;
  agreementId: string;
  partyId: string;
  accreditationId: string;
  productId: string;
  enrollmentId: string;
  marginAccountId: string;
  policyVersionId: string;
  amount: { toString(): string };
  status: string;
  confirmationMode: string;
  confirmationAttempts: number;
  confirmationExpiresAt: Date | null;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  expiredAt: Date | null;
  externalReference: string | null;
  createdAt: Date;
  product?: { id: string; code: string; name: string; family: string };
  marginAccount?: { id: string; marginGroup?: { id: string; code: string; name: string } };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function matchesReservationRequest(
  existing: Pick<ReservationViewSource, "partyId" | "enrollmentId" | "accreditationId" | "amount" | "externalReference">,
  partyId: string,
  input: CreateReservationDto,
  amount: string,
): boolean {
  return existing.partyId === partyId
    && existing.enrollmentId === input.enrollmentId
    && existing.accreditationId === input.accreditationId
    && compareMoney(existing.amount.toString(), amount) === 0
    && existing.externalReference === (input.externalReference?.trim() || null);
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: ReservationCodeService,
  ) {}

  async create(
    agreementId: string,
    partyId: string,
    input: CreateReservationDto,
    idempotencyKey: string | undefined,
    context: RequestContext,
  ) {
    const actorUserId = context.actor?.userId;
    if (!actorUserId) throw new UnauthorizedException();
    const key = idempotencyKey?.trim() ?? "";
    if (!IDEMPOTENCY_PATTERN.test(key)) {
      throw new BadRequestException("Idempotency-Key deve ter entre 8 e 128 caracteres seguros");
    }
    const amount = normalizeMoney(input.amount);
    if (!isPositiveMoney(amount)) throw new BadRequestException("Valor da reserva deve ser positivo");

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.marginReservation.findUnique({
            where: { agreementId_idempotencyKey: { agreementId, idempotencyKey: key } },
          });
          if (existing) {
            if (!matchesReservationRequest(existing, partyId, input, amount)) {
              throw new ConflictException("Chave idempotente reutilizada com dados diferentes");
            }
            return { ...this.view(existing), duplicate: true };
          }

          const now = new Date();
          const policyVersion = await transaction.agreementPolicyVersion.findFirst({
            where: { agreementId, policyType: "OPERATIONAL_RULES", status: "ACTIVE" },
            orderBy: { versionNumber: "desc" },
          });
          if (!policyVersion) throw new ConflictException("Convenio sem politica operacional ativa");
          const policy = operationalRulesSchema.safeParse(policyVersion.payload);
          if (!policy.success || !policy.data.marginGroups?.length) {
            throw new ConflictException("Politica ativa sem configuracao de margem valida");
          }

          const accreditation = await transaction.accreditation.findFirst({
            where: {
              id: input.accreditationId,
              agreementId,
              partyId,
              status: "ACTIVE",
              validFrom: { lte: now },
              OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            },
            include: { product: true },
          });
          if (!accreditation || accreditation.product.status !== "ACTIVE") {
            throw new ConflictException("Credenciamento ativo nao encontrado para o produto");
          }
          if (!policy.data.enabledProductFamilies.includes(accreditation.product.family)) {
            throw new ConflictException("Produto nao esta habilitado na politica do convenio");
          }
          if (
            accreditation.operationalLimit &&
            compareMoney(amount, accreditation.operationalLimit.toString()) > 0
          ) {
            throw new ConflictException("Valor excede o limite operacional do credenciamento");
          }
          const groupRule = policy.data.marginGroups.find((group) =>
            group.productFamilies.includes(accreditation.product.family),
          );
          if (!groupRule) throw new ConflictException("Produto sem grupo de margem configurado");

          const account = await transaction.marginAccount.findFirst({
            where: {
              agreementId,
              enrollmentId: input.enrollmentId,
              status: "ACTIVE",
              enrollment: { agreementId, status: "ACTIVE" },
              marginGroup: { code: groupRule.code, status: "ACTIVE" },
            },
          });
          if (!account) throw new NotFoundException("Conta de margem ativa nao encontrada");

          const reservationId = randomUUID();
          const confirmationRequired = policy.data.reservationConfirmation === "CODE_REQUIRED";
          const issuedCode = confirmationRequired ? this.codes.issue(reservationId) : null;
          const confirmationExpiresAt = confirmationRequired
            ? addMinutes(now, policy.data.confirmationCodeValidityMinutes)
            : null;
          const expiresAt = confirmationRequired
            ? null
            : addMinutes(now, policy.data.reservationValidityMinutes);

          const reservation = await transaction.marginReservation.create({
            data: {
              id: reservationId,
              agreementId,
              partyId,
              accreditationId: accreditation.id,
              productId: accreditation.productId,
              enrollmentId: input.enrollmentId,
              marginAccountId: account.id,
              policyVersionId: policyVersion.id,
              amount,
              status: confirmationRequired ? "PENDING_CONFIRMATION" : "ACTIVE",
              confirmationMode: policy.data.reservationConfirmation,
              confirmationCodeHash: issuedCode?.hash ?? null,
              confirmationExpiresAt,
              expiresAt,
              confirmedAt: confirmationRequired ? null : now,
              confirmedByUserId: confirmationRequired ? null : actorUserId,
              idempotencyKey: key,
              externalReference: input.externalReference?.trim() || null,
              createdByUserId: actorUserId,
            },
          });

          if (!confirmationRequired) {
            await this.reserveBalance(transaction, account, amount, reservation.id, context);
          }
          await transaction.outboxEvent.create({
            data: {
              agreementId,
              aggregateType: "margin_reservation",
              aggregateId: reservation.id,
              eventType: confirmationRequired
                ? "reservation.confirmation_requested"
                : "reservation.activated",
              payload: confirmationRequired
                ? {
                    reservationId: reservation.id,
                    enrollmentId: reservation.enrollmentId,
                    confirmationCodeProtected: issuedCode!.protectedCode,
                    confirmationExpiresAt: confirmationExpiresAt!.toISOString(),
                  }
                : { reservationId: reservation.id, amount },
              correlationId: context.correlationId,
            },
          });
          await this.audit(transaction, context, {
            agreementId,
            partyId,
            action: "reservation.create",
            outcome: "success",
            reservationId: reservation.id,
            data: {
              amount,
              status: reservation.status,
              productId: reservation.productId,
              policyVersionId: reservation.policyVersionId,
            },
          });

          return {
            ...this.view(reservation),
            duplicate: false,
            confirmationRequired,
            ...(confirmationRequired && accreditation.environment === "HOMOLOGATION"
              ? { homologationConfirmationCode: issuedCode!.code }
              : {}),
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const existing = await this.prisma.marginReservation.findUnique({
          where: { agreementId_idempotencyKey: { agreementId, idempotencyKey: key } },
        });
        if (existing && matchesReservationRequest(existing, partyId, input, amount)) {
          return { ...this.view(existing), duplicate: true };
        }
        if (existing) throw new ConflictException("Chave idempotente reutilizada com dados diferentes");
      }
      if (isPrismaCode(error, "P2034")) {
        throw new ConflictException("Concorrencia detectada; repita com a mesma chave idempotente");
      }
      throw error;
    }
  }

  async confirm(
    agreementId: string,
    partyId: string,
    reservationId: string,
    code: string,
    context: RequestContext,
  ) {
    const result = await this.serializableTransaction(
      async (transaction) => {
        const reservation = await transaction.marginReservation.findFirst({
          where: { id: reservationId, agreementId, partyId },
          include: { marginAccount: true, policyVersion: true },
        });
        if (!reservation) throw new NotFoundException("Reserva nao encontrada");
        if (reservation.status === "ACTIVE") return { value: { ...this.view(reservation), duplicate: true } };
        if (reservation.status !== "PENDING_CONFIRMATION" || !reservation.confirmationCodeHash) {
          throw new ConflictException("Reserva nao esta aguardando confirmacao");
        }
        const now = new Date();
        const policy = operationalRulesSchema.safeParse(reservation.policyVersion.payload);
        if (!policy.success) throw new ConflictException("Politica vinculada a reserva esta invalida");
        const expired = !reservation.confirmationExpiresAt || reservation.confirmationExpiresAt <= now;
        const valid = !expired && this.codes.verify(reservation.id, code, reservation.confirmationCodeHash);
        if (!valid) {
          const attempts = reservation.confirmationAttempts + 1;
          const exhausted = attempts >= policy.data.confirmationMaxAttempts || expired;
          await transaction.marginReservation.update({
            where: { id: reservation.id },
            data: {
              confirmationAttempts: attempts,
              ...(exhausted ? { status: "EXPIRED", expiredAt: now, confirmationCodeHash: null } : {}),
              lockVersion: { increment: 1 },
            },
          });
          await this.audit(transaction, context, {
            agreementId,
            partyId,
            action: "reservation.confirm",
            outcome: "denied",
            reservationId,
            data: { exhausted, attempts },
          });
          return { invalidCode: true };
        }

        await this.reserveBalance(
          transaction,
          reservation.marginAccount,
          reservation.amount.toString(),
          reservation.id,
          context,
        );
        const activated = await transaction.marginReservation.update({
          where: { id: reservation.id },
          data: {
            status: "ACTIVE",
            confirmationCodeHash: null,
            confirmedAt: now,
            confirmedByUserId: context.actor?.userId ?? null,
            expiresAt: addMinutes(now, policy.data.reservationValidityMinutes),
            lockVersion: { increment: 1 },
          },
        });
        await this.lifecycleEvent(transaction, context, activated, "reservation.activated");
        await this.audit(transaction, context, {
          agreementId,
          partyId,
          action: "reservation.confirm",
          outcome: "success",
          reservationId,
          data: { amount: activated.amount.toString(), status: activated.status },
        });
        return { value: { ...this.view(activated), duplicate: false } };
      },
    );
    if ("invalidCode" in result) throw new UnauthorizedException("Codigo invalido ou expirado");
    return result.value;
  }

  async cancel(
    agreementId: string,
    partyId: string,
    reservationId: string,
    reason: string,
    context: RequestContext,
  ) {
    return this.transitionToTerminal(agreementId, partyId, reservationId, "CANCELLED", reason.trim(), context);
  }

  async expire(
    agreementId: string,
    partyId: string,
    reservationId: string,
    context: RequestContext,
  ) {
    return this.transitionToTerminal(agreementId, partyId, reservationId, "EXPIRED", "Prazo da reserva expirado", context, true);
  }

  async list(agreementId: string, partyId: string) {
    const reservations = await this.prisma.marginReservation.findMany({
      where: { agreementId, partyId },
      include: { product: true, marginAccount: { include: { marginGroup: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return reservations.map((reservation) => this.view(reservation));
  }

  async get(agreementId: string, partyId: string, reservationId: string) {
    const reservation = await this.prisma.marginReservation.findFirst({
      where: { id: reservationId, agreementId, partyId },
      include: { product: true, marginAccount: { include: { marginGroup: true } } },
    });
    if (!reservation) throw new NotFoundException("Reserva nao encontrada");
    return this.view(reservation);
  }

  private async transitionToTerminal(
    agreementId: string,
    partyId: string,
    reservationId: string,
    target: "CANCELLED" | "EXPIRED",
    reason: string,
    context: RequestContext,
    requireExpired = false,
  ) {
    return this.serializableTransaction(
      async (transaction) => {
        const reservation = await transaction.marginReservation.findFirst({
          where: { id: reservationId, agreementId, partyId },
          include: { marginAccount: true },
        });
        if (!reservation) throw new NotFoundException("Reserva nao encontrada");
        if (reservation.status === target) return { ...this.view(reservation), duplicate: true };
        if (!['PENDING_CONFIRMATION', 'ACTIVE'].includes(reservation.status)) {
          throw new ConflictException("Reserva nao permite esta transicao");
        }
        const now = new Date();
        const deadline = reservation.status === "ACTIVE" ? reservation.expiresAt : reservation.confirmationExpiresAt;
        if (requireExpired && (!deadline || deadline > now)) {
          throw new ConflictException("Reserva ainda nao atingiu o prazo de expiracao");
        }
        if (reservation.status === "ACTIVE") {
          await this.releaseBalance(transaction, reservation.marginAccount, reservation.amount.toString(), reservation.id, context);
        }
        const updated = await transaction.marginReservation.update({
          where: { id: reservation.id },
          data: target === "CANCELLED"
            ? {
                status: target,
                cancelledAt: now,
                cancelledByUserId: context.actor?.userId ?? null,
                cancellationReason: reason,
                confirmationCodeHash: null,
                lockVersion: { increment: 1 },
              }
            : {
                status: target,
                expiredAt: now,
                confirmationCodeHash: null,
                lockVersion: { increment: 1 },
              },
        });
        await this.lifecycleEvent(transaction, context, updated, target === "CANCELLED" ? "reservation.cancelled" : "reservation.expired");
        await this.audit(transaction, context, {
          agreementId,
          partyId,
          action: target === "CANCELLED" ? "reservation.cancel" : "reservation.expire",
          outcome: "success",
          reservationId,
          data: { amount: updated.amount.toString(), previousStatus: reservation.status, status: target, reason },
        });
        return { ...this.view(updated), duplicate: false };
      },
    );
  }

  private async serializableTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isPrismaCode(error, "P2034")) {
        throw new ConflictException("Concorrencia detectada; repita a operacao");
      }
      throw error;
    }
  }

  private async reserveBalance(
    transaction: Prisma.TransactionClient,
    account: { id: string; enrollmentId: string; agreementId: string; availableAmount: { toString(): string }; lockVersion: number },
    amount: string,
    reservationId: string,
    context: RequestContext,
  ) {
    const before = account.availableAmount.toString();
    if (compareMoney(amount, before) > 0) throw new ConflictException("Margem disponivel insuficiente");
    const updated = await transaction.marginAccount.updateMany({
      where: { id: account.id, lockVersion: account.lockVersion, status: "ACTIVE", availableAmount: { gte: amount } },
      data: { reservedAmount: { increment: amount }, availableAmount: { decrement: amount }, lockVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConflictException("Saldo de margem foi alterado por outra operacao");
    await transaction.marginMovement.create({
      data: {
        agreementId: account.agreementId,
        marginAccountId: account.id,
        enrollmentId: account.enrollmentId,
        movementType: "RESERVATION",
        direction: "DECREASE",
        amount,
        balanceBefore: before,
        balanceAfter: subtractMoney(before, amount),
        sourceType: "MARGIN_RESERVATION",
        sourceId: reservationId,
        idempotencyKey: `reservation:${reservationId}:activate`,
        correlationId: context.correlationId,
        actorUserId: context.actor?.userId ?? null,
        reason: "Ativacao de reserva de margem",
      },
    });
  }

  private async releaseBalance(
    transaction: Prisma.TransactionClient,
    account: {
      id: string;
      enrollmentId: string;
      agreementId: string;
      totalAmount: { toString(): string };
      consumedAmount: { toString(): string };
      availableAmount: { toString(): string };
      reservedAmount: { toString(): string };
      blockedAmount: { toString(): string };
      lockVersion: number;
    },
    amount: string,
    reservationId: string,
    context: RequestContext,
  ) {
    const before = account.availableAmount.toString();
    if (compareMoney(amount, account.reservedAmount.toString()) > 0) {
      throw new ConflictException("Saldo reservado inconsistente");
    }
    const remainingReserved = subtractMoney(account.reservedAmount.toString(), amount);
    const after = availableMoney(
      account.totalAmount.toString(),
      account.consumedAmount.toString(),
      remainingReserved,
      account.blockedAmount.toString(),
    );
    const updated = await transaction.marginAccount.updateMany({
      where: { id: account.id, lockVersion: account.lockVersion, status: "ACTIVE", reservedAmount: { gte: amount } },
      data: { reservedAmount: { decrement: amount }, availableAmount: after, lockVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConflictException("Saldo de margem foi alterado por outra operacao");
    await transaction.marginMovement.create({
      data: {
        agreementId: account.agreementId,
        marginAccountId: account.id,
        enrollmentId: account.enrollmentId,
        movementType: "RELEASE",
        direction: compareMoney(after, before) > 0 ? "INCREASE" : "NO_CHANGE",
        amount,
        balanceBefore: before,
        balanceAfter: after,
        sourceType: "MARGIN_RESERVATION",
        sourceId: reservationId,
        idempotencyKey: `reservation:${reservationId}:release`,
        correlationId: context.correlationId,
        actorUserId: context.actor?.userId ?? null,
        reason: "Liberacao de reserva de margem",
      },
    });
  }

  private lifecycleEvent(
    transaction: Prisma.TransactionClient,
    context: RequestContext,
    reservation: { id: string; agreementId: string; status: string; amount: { toString(): string } },
    eventType: string,
  ) {
    return transaction.outboxEvent.create({
      data: {
        agreementId: reservation.agreementId,
        aggregateType: "margin_reservation",
        aggregateId: reservation.id,
        eventType,
        payload: { reservationId: reservation.id, status: reservation.status, amount: reservation.amount.toString() },
        correlationId: context.correlationId,
      },
    });
  }

  private audit(
    transaction: Prisma.TransactionClient,
    context: RequestContext,
    input: { agreementId: string; partyId: string; action: string; outcome: string; reservationId: string; data: Record<string, unknown> },
  ) {
    return transaction.auditEvent.create({
      data: {
        agreementId: input.agreementId,
        actorUserId: context.actor?.userId ?? null,
        actorRole: context.actor?.role ?? null,
        actorPartyId: input.partyId,
        action: input.action,
        outcome: input.outcome,
        entityType: "margin_reservation",
        entityId: input.reservationId,
        correlationId: context.correlationId,
        newData: input.data as Prisma.InputJsonValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private view(reservation: ReservationViewSource) {
    return {
      id: reservation.id,
      agreementId: reservation.agreementId,
      partyId: reservation.partyId,
      accreditationId: reservation.accreditationId,
      productId: reservation.productId,
      enrollmentId: reservation.enrollmentId,
      marginAccountId: reservation.marginAccountId,
      policyVersionId: reservation.policyVersionId,
      amount: reservation.amount.toString(),
      status: reservation.status,
      confirmationMode: reservation.confirmationMode,
      confirmationAttempts: reservation.confirmationAttempts,
      confirmationExpiresAt: reservation.confirmationExpiresAt?.toISOString() ?? null,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
      cancellationReason: reservation.cancellationReason,
      expiredAt: reservation.expiredAt?.toISOString() ?? null,
      externalReference: reservation.externalReference,
      createdAt: reservation.createdAt.toISOString(),
      ...(reservation.product ? { product: { id: reservation.product.id, code: reservation.product.code, name: reservation.product.name, family: reservation.product.family } } : {}),
      ...(reservation.marginAccount?.marginGroup ? { marginGroup: { id: reservation.marginAccount.marginGroup.id, code: reservation.marginAccount.marginGroup.code, name: reservation.marginAccount.marginGroup.name } } : {}),
    };
  }
}
