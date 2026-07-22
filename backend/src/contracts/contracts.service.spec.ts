import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { ContractsService } from "./contracts.service.js";

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
  requiredContractFields: ["CET", "FIRST_DUE_DATE", "CONTRACT_VALUE", "FIRST_COMPETENCY"],
  publicServantValidation: { enabled: false },
  marginGroups: [{ code: "LOAN", name: "Emprestimo", percentage: 35, sharingMode: "SEPARATE", productFamilies: ["PAYROLL_LOAN"] }],
};

function decimal(value: string) {
  return { toString: () => value };
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
    expiresAt: new Date(Date.now() + 3_600_000),
    lockVersion: 2,
    contract: null,
    accreditation: { status: "ACTIVE", validFrom: new Date("2026-01-01"), validUntil: null },
    product: {
      id: "product-1",
      status: "ACTIVE",
      family: "PAYROLL_LOAN",
      chargeMode: "FIXED_INSTALLMENTS",
      requiresCreditContract: true,
    },
    enrollment: { status: "ACTIVE" },
    marginAccount: {
      id: "account-1",
      status: "ACTIVE",
      lockVersion: 4,
      reservedAmount: decimal("300.00"),
      consumedAmount: decimal("400.00"),
      availableAmount: decimal("735.00"),
    },
    policyVersion: { payload: policyPayload },
    ...overrides,
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    agreementId: "agreement-1",
    partyId: "party-1",
    accreditationId: "accreditation-1",
    productId: "product-1",
    enrollmentId: "enrollment-1",
    marginAccountId: "account-1",
    policyVersionId: "policy-1",
    reservationId: "reservation-1",
    contractNumber: "CT-001",
    operationType: "NEW",
    status: "ACTIVE",
    contractValue: decimal("10000.00"),
    installmentAmount: decimal("200.00"),
    termInstallments: 60,
    currentInstallment: 0,
    cetAnnual: decimal("18.500000"),
    cetMonthly: null,
    firstDueDate: new Date("2026-08-10T00:00:00.000Z"),
    firstCompetency: new Date("2026-08-01T00:00:00.000Z"),
    outstandingBalance: decimal("10000.00"),
    originContractReference: null,
    originCreditorName: null,
    debtPurchaseAmount: null,
    externalReference: null,
    activatedAt: now,
    settledAt: null,
    createdAt: now,
    ...overrides,
  };
}

const validInput = {
  reservationId: "reservation-1",
  contractNumber: "CT-001",
  operationType: "NEW" as const,
  contractValue: "10000.00",
  termInstallments: 60,
  cetAnnual: "18.5",
  firstDueDate: "2026-08-10",
  firstCompetency: "2026-08",
};

function setup() {
  const transaction = {
    contract: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => contract({
        ...data,
        contractValue: data.contractValue ? decimal(data.contractValue) : null,
        installmentAmount: decimal(data.installmentAmount),
        cetAnnual: data.cetAnnual ? decimal(data.cetAnnual) : null,
        cetMonthly: data.cetMonthly ? decimal(data.cetMonthly) : null,
        outstandingBalance: data.outstandingBalance ? decimal(data.outstandingBalance) : null,
        debtPurchaseAmount: data.debtPurchaseAmount ? decimal(data.debtPurchaseAmount) : null,
        currentInstallment: 0,
        status: "ACTIVE",
        settledAt: null,
        createdAt: now,
      })),
    },
    marginReservation: {
      findFirst: vi.fn().mockResolvedValue(reservation()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    marginAccount: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    marginMovement: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
    contract: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  } as unknown as PrismaService;
  return { service: new ContractsService(prisma), transaction };
}

describe("ContractsService", () => {
  it("moves the installment from reserved to consumed without changing availability", async () => {
    const { service, transaction } = setup();

    const result = await service.create("agreement-1", "party-1", validInput, "contract-request-1", context);

    expect(transaction.marginAccount.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "account-1", lockVersion: 4, reservedAmount: { gte: "200.00" } }),
      data: expect.objectContaining({ reservedAmount: { decrement: "200.00" }, consumedAmount: { increment: "200.00" } }),
    });
    expect(transaction.marginMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: "CONSUMPTION",
        direction: "NO_CHANGE",
        balanceBefore: "735.00",
        balanceAfter: "735.00",
      }),
    });
    expect(transaction.marginReservation.updateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", status: "ACTIVE", lockVersion: 2 },
      data: expect.objectContaining({ status: "CONVERTED" }),
    });
    expect(result).toMatchObject({ id: "contract-1", status: "ACTIVE", installmentAmount: "200.00", duplicate: false });
  });

  it("rejects a reservation that was not confirmed", async () => {
    const { service, transaction } = setup();
    transaction.marginReservation.findFirst.mockResolvedValue(reservation({ status: "PENDING_CONFIRMATION" }));

    await expect(service.create("agreement-1", "party-1", validInput, "contract-request-2", context))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction.contract.create).not.toHaveBeenCalled();
  });

  it("requires the fields declared by the pinned policy", async () => {
    const { service } = setup();

    await expect(service.create(
      "agreement-1",
      "party-1",
      { reservationId: "reservation-1", contractNumber: "CT-002", operationType: "NEW", termInstallments: 60 },
      "contract-request-3",
      context,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires origin and purchase value for debt purchase", async () => {
    const { service } = setup();

    await expect(service.create(
      "agreement-1",
      "party-1",
      { ...validInput, operationType: "DEBT_PURCHASE" },
      "contract-request-4",
      context,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects stale account state before consuming the reservation", async () => {
    const { service, transaction } = setup();
    transaction.marginAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.create("agreement-1", "party-1", validInput, "contract-request-5", context))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction.marginMovement.create).not.toHaveBeenCalled();
  });

  it("returns an existing contract for a repeated idempotency key", async () => {
    const { service, transaction } = setup();
    transaction.contract.findUnique.mockResolvedValue(contract());

    const result = await service.create("agreement-1", "party-1", validInput, "contract-request-1", context);

    expect(result).toMatchObject({ id: "contract-1", duplicate: true });
    expect(transaction.marginReservation.findFirst).not.toHaveBeenCalled();
  });
});
