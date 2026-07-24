import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { ContractsService } from "./contracts.service.js";
import type { DataProtectionService } from "../platform/crypto/data-protection.service.js";

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
    fullyPaidInstallments: 0,
    totalDiscountedAmount: decimal("0.00"),
    arrearsAmount: decimal("0.00"),
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
    payrollCompletedAt: null,
    marginReleasedAt: null,
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
      findFirst: vi.fn(),
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contractArrearsPayment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "payment-1",
        ...data,
        amount: decimal(data.amount),
        arrearsBefore: decimal(data.arrearsBefore),
        arrearsAfter: decimal(data.arrearsAfter),
        createdAt: now,
      })),
    },
    contractArrearsPaymentReversal: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "reversal-1",
        ...data,
        amount: decimal(data.amount),
        arrearsBefore: decimal(data.arrearsBefore),
        arrearsAfter: decimal(data.arrearsAfter),
        reversedAt: now,
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
    contract: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
    },
    contractArrearsPayment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    contractArrearsPaymentReversal: { findUnique: vi.fn() },
  } as unknown as PrismaService;
  const protection = {
    encrypt: vi.fn((value: string) => `protected:${value}`),
    decrypt: vi.fn((value: string) => value.replace(/^protected:/, "")),
  } as unknown as DataProtectionService;
  return {
    service: new ContractsService(prisma, protection),
    transaction,
    protection,
    prisma: prisma as unknown as {
      contract: { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
      contractArrearsPayment: { aggregate: ReturnType<typeof vi.fn> };
      contractArrearsPaymentReversal: { findUnique: ReturnType<typeof vi.fn> };
    },
  };
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

  it("rejects an idempotency key reused for different contract data", async () => {
    const { service, transaction } = setup();
    transaction.contract.findUnique.mockResolvedValue(contract());

    await expect(service.create(
      "agreement-1",
      "party-1",
      { ...validInput, contractNumber: "CT-002" },
      "contract-request-1",
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.marginReservation.findFirst).not.toHaveBeenCalled();
  });

  it("returns a party-scoped arrears overview without servant identifiers", async () => {
    const { service, prisma } = setup();
    prisma.contract.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 2 },
        _sum: { arrearsAmount: decimal("180.00") },
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { arrearsAmount: decimal("120.00") },
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { arrearsAmount: decimal("60.00") },
      });
    prisma.contractArrearsPayment.aggregate.mockResolvedValue({
      _count: { _all: 3 },
      _sum: { amount: decimal("90.00") },
    });
    prisma.contract.findMany.mockResolvedValue([{
      ...contract({
        currentInstallment: 4,
        fullyPaidInstallments: 3,
        arrearsAmount: decimal("120.00"),
      }),
      updatedAt: now,
      party: { id: "party-1", legalName: "Banco Teste SA", tradeName: "Banco Teste" },
      product: {
        id: "product-1",
        code: "LOAN",
        name: "Emprestimo",
        family: "PAYROLL_LOAN",
      },
      payrollDiscountEvents: [{
        processedAt: new Date("2026-07-22T12:00:00.000Z"),
        installmentNumber: 4,
        expectedAmount: decimal("200.00"),
        discountedAmount: decimal("80.00"),
        reason: "Margem insuficiente",
      }],
    }]);

    const result = await service.getArrearsOverview(
      "agreement-1",
      "party-1",
      { productFamily: "PAYROLL_LOAN", minArrears: "50.00", limit: 25 },
    );

    expect(prisma.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        agreementId: "agreement-1",
        partyId: "party-1",
        arrearsAmount: { gte: "50.00" },
        product: { family: "PAYROLL_LOAN" },
      }),
      take: 25,
    }));
    expect(prisma.contractArrearsPayment.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ reversal: { is: null } }),
    }));
    expect(result.summary).toEqual({
      contractsWithArrears: 2,
      totalArrearsAmount: "180.00",
      activeSchedule: { contracts: 1, amount: "120.00" },
      payrollCompleted: { contracts: 1, amount: "60.00" },
      recoveredOnOpenContracts: { payments: 3, amount: "90.00" },
    });
    expect(result.contracts[0]).toMatchObject({
      contractNumber: "CT-001",
      arrearsAmount: "120.00",
      party: { id: "party-1", name: "Banco Teste" },
      latestPartial: { shortfallAmount: "120.00" },
    });
    expect(result.contracts[0]).not.toHaveProperty("enrollmentId");
  });

  it("records an external arrears payment without changing the installment schedule", async () => {
    const { service, transaction } = setup();
    transaction.contract.findFirst.mockResolvedValue(contract({
      currentInstallment: 10,
      fullyPaidInstallments: 8,
      arrearsAmount: decimal("130.00"),
      version: 5,
    }));

    const result = await service.recordArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      {
        amount: "100.00",
        method: "PIX",
        paidAt: "2026-07-23T10:00:00Z",
        externalReference: "E2E-PIX-001",
      },
      "arrears-payment-001",
      context,
    );

    expect(transaction.contract.updateMany).toHaveBeenCalledWith({
      where: {
        id: "contract-1",
        version: 5,
        arrearsAmount: expect.objectContaining({ toString: expect.any(Function) }),
      },
      data: {
        arrearsAmount: "30.00",
        status: "ACTIVE",
        settledAt: null,
        version: { increment: 1 },
      },
    });
    expect(transaction.contractArrearsPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: "100.00",
        arrearsBefore: "130.00",
        arrearsAfter: "30.00",
        method: "PIX",
      }),
    });
    expect(result).toMatchObject({
      amount: "100.00",
      arrearsBefore: "130.00",
      arrearsAfter: "30.00",
      duplicate: false,
      contractSettled: false,
    });
  });

  it("settles a completed payroll contract when the final arrears balance is paid", async () => {
    const { service, transaction } = setup();
    transaction.contract.findFirst.mockResolvedValue(contract({
      status: "PAYROLL_COMPLETED_WITH_ARREARS",
      currentInstallment: 60,
      fullyPaidInstallments: 58,
      arrearsAmount: decimal("80.00"),
      payrollCompletedAt: now,
      marginReleasedAt: now,
      version: 9,
    }));

    const result = await service.recordArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      { amount: "80.00", method: "BOLETO", paidAt: "2026-07-23T11:00:00Z" },
      "arrears-payment-002",
      context,
    );

    expect(transaction.contract.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ arrearsAmount: "0.00", status: "SETTLED" }),
    }));
    expect(result).toMatchObject({ arrearsAfter: "0.00", contractSettled: true });
  });

  it("rejects an external payment above the arrears balance", async () => {
    const { service, transaction } = setup();
    transaction.contract.findFirst.mockResolvedValue(contract({
      arrearsAmount: decimal("50.00"),
      version: 2,
    }));

    await expect(service.recordArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      { amount: "50.01", method: "PIX", paidAt: "2026-07-23T12:00:00Z" },
      "arrears-payment-003",
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.contract.updateMany).not.toHaveBeenCalled();
    expect(transaction.contractArrearsPayment.create).not.toHaveBeenCalled();
  });

  it("rejects an external payment dated before contract activation", async () => {
    const { service, transaction } = setup();
    transaction.contract.findFirst.mockResolvedValue(contract({
      arrearsAmount: decimal("50.00"),
      version: 2,
    }));

    await expect(service.recordArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      { amount: "10.00", method: "PIX", paidAt: "2026-07-20T12:00:00Z" },
      "arrears-payment-004",
      context,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.contract.updateMany).not.toHaveBeenCalled();
    expect(transaction.contractArrearsPayment.create).not.toHaveBeenCalled();
  });

  it("rejects an external payment dated in the future", async () => {
    const { service, transaction } = setup();

    await expect(service.recordArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      { amount: "10.00", method: "PIX", paidAt: "2999-07-23T12:00:00Z" },
      "arrears-payment-005",
      context,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.contract.findFirst).not.toHaveBeenCalled();
    expect(transaction.contractArrearsPayment.create).not.toHaveBeenCalled();
  });

  it("reverses an arrears payment and restores the balance without changing the schedule", async () => {
    const { service, transaction, protection } = setup();
    transaction.contractArrearsPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      agreementId: "agreement-1",
      partyId: "party-1",
      contractId: "contract-1",
      amount: decimal("100.00"),
      reversal: null,
      contract: contract({
        currentInstallment: 10,
        arrearsAmount: decimal("30.00"),
        version: 6,
      }),
    });

    const result = await service.reverseArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      "payment-1",
      { reason: "Pagamento registrado em duplicidade" },
      "arrears-reversal-001",
      context,
    );

    expect(transaction.contract.updateMany).toHaveBeenCalledWith({
      where: {
        id: "contract-1",
        version: 6,
        arrearsAmount: expect.objectContaining({ toString: expect.any(Function) }),
        status: "ACTIVE",
      },
      data: {
        arrearsAmount: "130.00",
        status: "ACTIVE",
        settledAt: null,
        version: { increment: 1 },
      },
    });
    expect(protection.encrypt).toHaveBeenCalledWith(
      "Pagamento registrado em duplicidade",
      "contract.arrears_reversal_reason",
    );
    expect(result).toMatchObject({
      amount: "100.00",
      arrearsBefore: "30.00",
      arrearsAfter: "130.00",
      duplicate: false,
      contractReopened: false,
    });
  });

  it("reopens a payroll-completed contract when its final payment is reversed", async () => {
    const { service, transaction } = setup();
    transaction.contractArrearsPayment.findFirst.mockResolvedValue({
      id: "payment-2",
      agreementId: "agreement-1",
      partyId: "party-1",
      contractId: "contract-1",
      amount: decimal("80.00"),
      reversal: null,
      contract: contract({
        status: "SETTLED",
        currentInstallment: 60,
        arrearsAmount: decimal("0.00"),
        payrollCompletedAt: now,
        marginReleasedAt: now,
        settledAt: now,
        version: 10,
      }),
    });

    const result = await service.reverseArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      "payment-2",
      { reason: "Pagamento posteriormente cancelado" },
      "arrears-reversal-002",
      context,
    );

    expect(transaction.contract.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        arrearsAmount: "80.00",
        status: "PAYROLL_COMPLETED_WITH_ARREARS",
        settledAt: null,
      }),
    }));
    expect(result).toMatchObject({ contractReopened: true, arrearsAfter: "80.00" });
  });

  it("returns the same reversal for a repeated idempotency key", async () => {
    const { service, transaction } = setup();
    transaction.contractArrearsPaymentReversal.findUnique.mockResolvedValue({
      id: "reversal-1",
      agreementId: "agreement-1",
      partyId: "party-1",
      contractId: "contract-1",
      paymentId: "payment-1",
      amount: decimal("100.00"),
      arrearsBefore: decimal("30.00"),
      arrearsAfter: decimal("130.00"),
      reasonEncrypted: "protected:Pagamento registrado em duplicidade",
      reversedByUserId: "user-1",
      reversedAt: now,
    });

    const result = await service.reverseArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      "payment-1",
      { reason: "Pagamento registrado em duplicidade" },
      "arrears-reversal-001",
      context,
    );

    expect(result).toMatchObject({ id: "reversal-1", duplicate: true });
    expect(transaction.contractArrearsPayment.findFirst).not.toHaveBeenCalled();
    expect(transaction.contract.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a second reversal of the same payment", async () => {
    const { service, transaction } = setup();
    transaction.contractArrearsPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      agreementId: "agreement-1",
      partyId: "party-1",
      contractId: "contract-1",
      amount: decimal("100.00"),
      reversal: { id: "reversal-existing" },
      contract: contract({ arrearsAmount: decimal("30.00"), version: 6 }),
    });

    await expect(service.reverseArrearsPayment(
      "agreement-1",
      "party-1",
      "contract-1",
      "payment-1",
      { reason: "Nova tentativa de estorno" },
      "arrears-reversal-003",
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.contract.updateMany).not.toHaveBeenCalled();
    expect(transaction.contractArrearsPaymentReversal.create).not.toHaveBeenCalled();
  });
});
