import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import type { ReservationCodeService } from "./reservation-code.service.js";
import { ReservationsService } from "./reservations.service.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const context: RequestContext = {
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
  actor: { userId: "user-1", role: "operator", memberships: [] },
  ipAddress: "127.0.0.1",
  userAgent: "test",
};
const policyPayload = {
  marginConsultationAuthorization: "NOT_REQUIRED",
  reservationConfirmation: "IMMEDIATE",
  reservationValidityMinutes: 1_440,
  confirmationCodeValidityMinutes: 10,
  confirmationMaxAttempts: 5,
  cutoffDay: 20,
  enabledProductFamilies: ["PAYROLL_LOAN"],
  eligibleFunctionalStatuses: ["ACTIVE"],
  requiredContractFields: ["CET"],
  publicServantValidation: { enabled: false },
  marginGroups: [{ code: "LOAN", name: "Emprestimo", percentage: 35, sharingMode: "SEPARATE", productFamilies: ["PAYROLL_LOAN"] }],
};

function decimal(value: string) {
  return { toString: () => value };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-1",
    agreementId: "agreement-1",
    enrollmentId: "enrollment-1",
    totalAmount: decimal("1435.00"),
    consumedAmount: decimal("300.00"),
    reservedAmount: decimal("100.00"),
    blockedAmount: decimal("35.00"),
    availableAmount: decimal("1000.00"),
    lockVersion: 3,
    ...overrides,
  };
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "reservation-1",
    agreementId: "agreement-1",
    partyId: "party-1",
    accreditationId: "accreditation-1",
    productId: "product-1",
    enrollmentId: "enrollment-1",
    marginAccountId: "account-1",
    policyVersionId: "policy-1",
    amount: decimal("200.00"),
    status: "ACTIVE",
    confirmationMode: "IMMEDIATE",
    confirmationAttempts: 0,
    confirmationCodeHash: null,
    confirmationExpiresAt: null,
    expiresAt: new Date("2026-07-22T12:00:00.000Z"),
    confirmedAt: now,
    cancelledAt: null,
    cancellationReason: null,
    expiredAt: null,
    externalReference: null,
    createdAt: now,
    ...overrides,
  };
}

function setup(mode: "IMMEDIATE" | "CODE_REQUIRED" = "IMMEDIATE") {
  const transaction = {
    marginReservation: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => reservation({
        ...data,
        amount: decimal(data.amount),
        confirmationAttempts: 0,
        createdAt: now,
      })),
      update: vi.fn(),
    },
    agreementPolicyVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id: "policy-1",
        versionNumber: 1,
        payload: { ...policyPayload, reservationConfirmation: mode },
      }),
    },
    accreditation: {
      findFirst: vi.fn().mockResolvedValue({
        id: "accreditation-1",
        productId: "product-1",
        environment: "HOMOLOGATION",
        operationalLimit: null,
        product: { id: "product-1", status: "ACTIVE", family: "PAYROLL_LOAN" },
      }),
    },
    marginAccount: {
      findFirst: vi.fn().mockResolvedValue(account()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    marginMovement: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
    marginReservation: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  } as unknown as PrismaService;
  const codes = {
    issue: vi.fn().mockReturnValue({ code: "123456", hash: "code-hash", protectedCode: "protected-code" }),
    verify: vi.fn().mockReturnValue(true),
  } as unknown as ReservationCodeService;
  return { service: new ReservationsService(prisma, codes), transaction, codes };
}

describe("ReservationsService", () => {
  it("activates an immediate reservation and decreases available margin atomically", async () => {
    const { service, transaction } = setup();

    const result = await service.create(
      "agreement-1",
      "party-1",
      { enrollmentId: "enrollment-1", accreditationId: "accreditation-1", amount: "200" },
      "request-0001",
      context,
    );

    expect(transaction.marginAccount.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "account-1", lockVersion: 3 }),
      data: expect.objectContaining({ reservedAmount: { increment: "200.00" }, availableAmount: { decrement: "200.00" } }),
    });
    expect(transaction.marginMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ movementType: "RESERVATION", balanceBefore: "1000.00", balanceAfter: "800.00" }),
    });
    expect(result).toMatchObject({ status: "ACTIVE", duplicate: false, confirmationRequired: false });
  });

  it("creates a pending challenge without holding margin and exposes the code only in homologation", async () => {
    const { service, transaction } = setup("CODE_REQUIRED");

    const result = await service.create(
      "agreement-1",
      "party-1",
      { enrollmentId: "enrollment-1", accreditationId: "accreditation-1", amount: "200.00" },
      "request-0002",
      context,
    );

    expect(transaction.marginAccount.updateMany).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "reservation.confirmation_requested",
        payload: expect.objectContaining({ confirmationCodeProtected: "protected-code" }),
      }),
    });
    expect(result).toMatchObject({ status: "PENDING_CONFIRMATION", homologationConfirmationCode: "123456" });
  });

  it("rejects an idempotency key reused for a different reservation", async () => {
    const { service, transaction } = setup();
    transaction.marginReservation.findUnique.mockResolvedValue(reservation());

    await expect(service.create(
      "agreement-1",
      "party-1",
      { enrollmentId: "enrollment-1", accreditationId: "accreditation-1", amount: "250.00" },
      "request-0001",
      context,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it("never exposes a confirmation code for a production accreditation", async () => {
    const { service, transaction } = setup("CODE_REQUIRED");
    transaction.accreditation.findFirst.mockResolvedValue({
      id: "accreditation-1",
      productId: "product-1",
      environment: "PRODUCTION",
      operationalLimit: null,
      product: { id: "product-1", status: "ACTIVE", family: "PAYROLL_LOAN" },
    });

    const result = await service.create(
      "agreement-1",
      "party-1",
      { enrollmentId: "enrollment-1", accreditationId: "accreditation-1", amount: "200.00" },
      "request-0003",
      context,
    );

    expect(result).not.toHaveProperty("homologationConfirmationCode");
  });

  it("persists a failed confirmation attempt before returning a generic denial", async () => {
    const { service, transaction, codes } = setup("CODE_REQUIRED");
    vi.mocked(codes.verify).mockReturnValue(false);
    transaction.marginReservation.findFirst.mockResolvedValue(reservation({
      status: "PENDING_CONFIRMATION",
      confirmationMode: "CODE_REQUIRED",
      confirmationCodeHash: "code-hash",
      confirmationExpiresAt: new Date(Date.now() + 60_000),
      policyVersion: { payload: { ...policyPayload, reservationConfirmation: "CODE_REQUIRED" } },
      marginAccount: account(),
    }));
    transaction.marginReservation.update.mockResolvedValue({});

    await expect(service.confirm("agreement-1", "party-1", "reservation-1", "000000", context))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(transaction.marginReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      data: expect.objectContaining({ confirmationAttempts: 1 }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: "denied" }) });
  });

  it("rechecks and reserves the current balance when a valid code is confirmed", async () => {
    const { service, transaction } = setup("CODE_REQUIRED");
    const pending = reservation({
      status: "PENDING_CONFIRMATION",
      confirmationMode: "CODE_REQUIRED",
      confirmationCodeHash: "code-hash",
      confirmationExpiresAt: new Date(Date.now() + 60_000),
      policyVersion: { payload: { ...policyPayload, reservationConfirmation: "CODE_REQUIRED" } },
      marginAccount: account(),
    });
    transaction.marginReservation.findFirst.mockResolvedValue(pending);
    transaction.marginReservation.update.mockImplementation(({ data }) => reservation({ ...pending, ...data, status: "ACTIVE" }));

    const result = await service.confirm("agreement-1", "party-1", "reservation-1", "123456", context);

    expect(transaction.marginAccount.updateMany).toHaveBeenCalledOnce();
    expect(transaction.marginReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      data: expect.objectContaining({ status: "ACTIVE", confirmationCodeHash: null }),
    });
    expect(result).toMatchObject({ status: "ACTIVE", duplicate: false });
  });

  it("expires the challenge and removes its hash after the maximum attempts", async () => {
    const { service, transaction, codes } = setup("CODE_REQUIRED");
    vi.mocked(codes.verify).mockReturnValue(false);
    transaction.marginReservation.findFirst.mockResolvedValue(reservation({
      status: "PENDING_CONFIRMATION",
      confirmationMode: "CODE_REQUIRED",
      confirmationAttempts: 4,
      confirmationCodeHash: "code-hash",
      confirmationExpiresAt: new Date(Date.now() + 60_000),
      policyVersion: { payload: { ...policyPayload, reservationConfirmation: "CODE_REQUIRED" } },
      marginAccount: account(),
    }));
    transaction.marginReservation.update.mockResolvedValue({});

    await expect(service.confirm("agreement-1", "party-1", "reservation-1", "000000", context))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(transaction.marginReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      data: expect.objectContaining({
        confirmationAttempts: 5,
        status: "EXPIRED",
        confirmationCodeHash: null,
      }),
    });
  });

  it("rejects a stale account version instead of overspending the margin", async () => {
    const { service, transaction } = setup();
    transaction.marginAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.create(
      "agreement-1",
      "party-1",
      { enrollmentId: "enrollment-1", accreditationId: "accreditation-1", amount: "200.00" },
      "request-0004",
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.marginMovement.create).not.toHaveBeenCalled();
  });

  it("releases the commitment without inventing availability on a deficit account", async () => {
    const { service, transaction } = setup();
    const deficitAccount = account({
      totalAmount: decimal("100.00"),
      consumedAmount: decimal("100.00"),
      reservedAmount: decimal("50.00"),
      blockedAmount: decimal("0.00"),
      availableAmount: decimal("0.00"),
    });
    const active = reservation({ amount: decimal("50.00"), marginAccount: deficitAccount });
    transaction.marginReservation.findFirst.mockResolvedValue(active);
    transaction.marginReservation.update.mockImplementation(({ data }) => reservation({ ...active, ...data, status: "CANCELLED" }));

    await service.cancel("agreement-1", "party-1", "reservation-1", "Solicitacao cancelada", context);

    expect(transaction.marginAccount.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "account-1" }),
      data: expect.objectContaining({ reservedAmount: { decrement: "50.00" }, availableAmount: "0.00" }),
    });
    expect(transaction.marginMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ movementType: "RELEASE", direction: "NO_CHANGE", balanceAfter: "0.00" }),
    });
  });

  it("rejects expiration before the configured deadline", async () => {
    const { service, transaction } = setup();
    transaction.marginReservation.findFirst.mockResolvedValue(reservation({ marginAccount: account(), expiresAt: new Date(Date.now() + 60_000) }));

    await expect(service.expire("agreement-1", "party-1", "reservation-1", context))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction.marginAccount.updateMany).not.toHaveBeenCalled();
  });
});
