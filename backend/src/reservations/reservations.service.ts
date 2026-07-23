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
.v◊ŒÌ¢Gß≤⁄Óù∆≠yŸ;
  }

  async get(agreementId: string, enrollmentId: string) {
    const row = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, agreementId },
      include: { person: true },
    });
    if (!row) throw new NotFoundException("Servidor nao encontrado");
    return this.toView(row);
  }

  async lookup(agreementId: string, input: ServantLookupDto) {
    if (!input.cpf && !input.enrollmentNumber) {
      throw new BadRequestException("Informe CPF ou matricula");
    }

    const cpf = input.cpf ? normalizeCpf(input.cpf) : undefined;
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException("CPF invalido");
    const enrollmentNumber = input.enrollmentNumber
      ? normalizeEnrollmentNumber(input.enrollmentNumber)
      : undefined;

    const row = await this.prisma.enrollment.findFirst({
      where: {
        agreementId,
        ...(enrollmentNumber
          ? {
              enrollmentLookupKey: this.protection.lookupHash(
                enrollmentNumber,
                "enrollment.number",
              ),
            }
          : {}),
        ...(cpf
          ? { person: { cpfLookupHash: this.protection.lookupHash(cpf, "person.cpf") } }
          : {}),
      },
      include: { person: true },
    });
    if (!row) throw new NotFoundException("Servidor nao encontrado");
    return this.toLookupView(row);
  }

  private toLookupView(row: EnrollmentWithPerson) {
    const view = this.toView(row);
    return {
      id: view.id,
      agreementId: view.agreementId,
      person: view.person,
      enrollmentNumberMasked: view.enrollmentNumberMasked,
      functionalStatus: view.functionalStatus,
      employmentType: view.employmentType,
      status: view.status,
    };
  }

  private toView(row: EnrollmentWithPerson) {
    const cpf = this.protection.decrypt(row.person.cpfEncrypted, "person.cpf");
    const enrollmentNumber = this.protection.decrypt(
      row.enrollmentNumberEncrypted,
      "enrollment.number",
    );
    return {
      id: row.id,
      agreementId: row.agreementId,
      person: {
        id: row.person.id,
        fullName: row.person.fullName,
        socialName: row.person.socialName,
        cpfMasked: maskCpf(cpf),
        birthDate: row.person.birthDate.toISOString().slice(0, 10),
        status: row.person.status,
        emailRegistered: row.person.emailEncrypted !== null,
        phoneRegistered: row.person.phoneEncrypted !== null,
      },
      enrollmentNumberMasked: maskEnrollmentNumber(enrollmentNumber),
      functionalStatus: row.functionalStatus,
      employmentType: row.employmentType,
      admissionDate: row.admissionDate?.toISOString().slice(0, 10) ?? null,
      terminationDate: row.terminationDate?.toISOString().slice(0, 10) ?? null,
      payrollGroup: row.payrollGroup,
      department: row.department,
      costCenter: row.costCenter,
      baseSalary: row.baseSalary.toString(),
      mandatoryDeductions: row.mandatoryDeductions.toString(),
      marginBase: row.marginBase.toString(),
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
