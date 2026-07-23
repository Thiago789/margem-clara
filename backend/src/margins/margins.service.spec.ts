import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { MarginsService } from "./margins.service.js";

const context: RequestContext = {
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
  actor: { userId: "user-1", role: "agreement_manager", memberships: [] },
  ipAddress: "127.0.0.1",
  userAgent: "test",
};
const policyPayload = {
  marginConsultationAuthorization: "NOT_REQUIRED",
  reservationConfirmation: "IMMEDIATE",
  cutoffDay: 20,
  enabledProductFamilies: ["PAYROLL_LOAN"],
  eligibleFunctionalStatuses: ["ACTIVE"],
  requiredContractFields: ["CET"],
  publicServantValidation: { enabled: false },
  marginGroups: [
    {
      code: "LOAN",
      name: "Emprestimo consignado",
      percentage: 35,
      sharingMode: "SEPARATE",
      productFamilies: ["PAYROLL_LOAN"],
      payrollRubricCode: "9001",
    },
  ],
};

function decimal(value: string) {
  return { toString: () => value };
}

function setup(options: { existingSnapshots?: number; functionalStatus?: string } = {}) {
  const cycle = {
    id: "cycle-1",
    agreementId: "agreement-1",
    competency: new Date("2026-07-01T00:00:00.000Z"),
    status: "PUBLISHED",
    policyVersion: { id: "policy-1", payload: policyPayload },
  };
  const account = {
    id: "account-1",
    consumedAmount: decimal("300.00"),
    reservedAmount: decimal("100.00"),
    blockedAmount: decimal("35.00"),
    availableAmount: decimal("900.00"),
    lockVersion: 2,
    currentSnapshot: null,
  };
  const transaction = {
    payrollCycle: { findFirst: vi.fn().mockResolvedValue(cycle) },
    marginSnapshot: {
      count: vi.fn().mockResolvedValue(options.existingSnapshots ?? 0),
      create: vi.fn().mockResolvedValue({ id: "snapshot-1" }),
    },
    enrollmentPayrollSnapshot: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "payroll-snapshot-1",
          enrollmentId: "enrollment-1",
          afterData: {
            functionalStatus: options.functionalStatus ?? "ACTIVE",
            employmentType: "EFFECTIVE",
            payrollGroup: null,
            department: null,
            costCenter: null,
            baseSalary: "5000.00",
            mandatoryDeductions: "900.00",
            marginBase: "4100.00",
            sourceUpdatedAt: "2026-07-20T12:00:00Z",
          },
        },
      ]),
    },
    marginGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: "group-1", code: "LOAN" }),
    },
    marginAccount: {
      findUnique: vi.fn().mockResolvedValue(account),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    marginMovement: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    ),
    marginSnapshot: { count: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    marginAccount: { findMany: vi.fn() },
  } as unknown as PrismaService;
  return { service: new MarginsService(prisma), transaction, prisma: prisma as any, account };
}

describe("MarginsService", () => {
  it("publishes a snapshot, movement and current account atomically", async () => {
    const { service, transaction } = setup();

    const result = await service.calculate("agreement-1", "cycle-1", context);

    expect(transaction.marginSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        calculationBase: "4100.00",
        percentage: "35.0000",
        totalAmount: "1435.00",
        availableAmount: "1000.00",
        calculationVersion: 3,
        explanation: expect.objectContaining({
          payrollSnapshotId: "payroll-snapshot-1",
          policyVersionId: "policy-1",
        }),
      }),
    });
    expect(transaction.marginMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: "INCREASE",
        amount: "100.00",
        balanceBefore: "900.00",
        balanceAfter: "1000.00",
      }),
    });
    expect(transaction.marginAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "account-1", lockVersion: 2 },
      data: expect.objectContaining({ currentSnapshotId: "snapshot-1", lockVersion: { increment: 1 } }),
    });
    expect(result).toEqual({
      payrollCycleId: "cycle-1",
      status: "CALCULATED",
      snapshotCount: 1,
      duplicate: false,
    });
  });

  it("is idempotent after snapshots already exist for the cycle", async () => {
    const { service, transaction } = setup({ existingSnapshots: 1 });

    const result = await service.calculate("agreement-1", "cycle-1", context);

    expect(result.duplicate).toBe(true);
    expect(transaction.marginGroup.upsert).not.toHaveBeenCalled();
    expect(transaction.marginAccount.updateMany).not.toHaveBeenCalled();
  });

  it("sets an ineligible functional status to zero margin", async () => {
    const { service, transaction } = setup({ functionalStatus: "TERMINATED" });

    await service.calculate("agreement-1", "cycle-1", context);

    expect(transaction.marginSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmount: "0.00", availableAmount: "0.00" }),
    });
  });

  it("does not let an older cycle replace a newer current snapshot", async () => {
    const { service, transaction, account } = setup();
    transaction.marginAccount.findUnique.mockResolvedValue({
      ...account,
      currentSnapshot: {
        payrollCycle: { competency: new Date("2026-08-01T00:00:00.000Z") },
      },
    });

    await expect(service.calculate("agreement-1", "cycle-1", context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.marginSnapshot.create).not.toHaveBeenCalled();
  });

  it("requires a formal migration before removing an active margin group", async () => {
    const { service, transaction } = setup();
    transaction.marginGroup.findMany.mockResolvedValue([{ code: "OLD_CARD" }]);

    await expect(service.calculate("agreement-1", "cycle-1", context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.marginSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects a concurrent account update instead of overwriting a newer balance", async () => {
    const { service, transaction } = setup();
    transaction.marginAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.calculate("agreement-1", "cycle-1", context)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
