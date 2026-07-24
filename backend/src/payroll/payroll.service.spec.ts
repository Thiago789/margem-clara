import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DataProtectionService } from "../platform/crypto/data-protection.service.js";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { PayrollService } from "./payroll.service.js";

const context: RequestContext = {
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
  actor: { userId: "user-1", role: "agreement_manager", memberships: [] },
  ipAddress: "127.0.0.1",
  userAgent: "test",
};
const cycle = {
  id: "cycle-1",
  agreementId: "agreement-1",
  competency: new Date("2026-07-01T00:00:00.000Z"),
  cutoffAt: new Date("2026-07-20T23:59:59.000Z"),
  insertionDueAt: null,
  returnDueAt: null,
  status: "OPEN",
  policyVersionId: "policy-1",
  version: 1,
};
const storedFile = {
  id: "file-1",
  agreementId: "agreement-1",
  payrollCycleId: "cycle-1",
  protocolNumber: "MG-202607-ABCDEF123456",
  originalFileName: "margem.csv",
  layoutVersion: "MARGIN_V1",
  environment: "HOMOLOGATION",
  status: "VALIDATED",
  totalRows: 1,
  validRows: 1,
  invalidRows: 0,
  totalAmount: { toString: () => "4100.00" },
  sizeBytes: 150n,
  createdAt: new Date("2026-07-20T21:00:00.000Z"),
  processedAt: null,
};
const csv = Buffer.from(
  "matricula;situacao_funcional;remuneracao_base;descontos_obrigatorios;base_margem\nMAT-123;ACTIVE;5.000,00;900,00;4.100,00",
);

function decimal(value: string) {
  return { toString: () => value };
}

function setup() {
  const transaction = {
    agreement: { findUnique: vi.fn().mockResolvedValue({ id: "agreement-1", status: "ACTIVE" }) },
    agreementPolicyVersion: { findFirst: vi.fn().mockResolvedValue({ id: "policy-1" }) },
    payrollCycle: {
      create: vi.fn().mockResolvedValue(cycle),
      findFirst: vi.fn().mockResolvedValue({ id: "cycle-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    payrollFile: {
      create: vi.fn().mockResolvedValue(storedFile),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ ...storedFile, status: "APPLIED", processedAt: new Date() }),
    },
    payrollFileRow: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    enrollmentPayrollSnapshot: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    ),
    payrollCycle: { findFirst: vi.fn().mockResolvedValue(cycle), findMany: vi.fn() },
    payrollFile: { findFirst: vi.fn().mockResolvedValue(null) },
    enrollment: {
      findMany: vi.fn().mockResolvedValue([
        { id: "enrollment-1", enrollmentLookupKey: "hash:enrollment.number:MAT-123" },
      ]),
    },
  } as unknown as PrismaService;
  const protection = {
    lookupHash: vi.fn((value: string, purpose: string) => `hash:${purpose}:${value}`),
    encrypt: vi.fn((value: string, purpose: string) => `enc:${purpose}:${value}`),
  } as unknown as DataProtectionService;
  return {
    service: new PayrollService(prisma, protection),
    prisma: prisma as any,
    transaction,
    protection: protection as any,
  };
}

describe("PayrollService", () => {
  it("pins the active policy when opening a competency", async () => {
    const { service, transaction } = setup();

    const result = await service.createCycle(
      "agreement-1",
      { competency: "2026-07", cutoffAt: "2026-07-20T23:59:59Z" },
      context,
    );

    expect(transaction.payrollCycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ policyVersionId: "policy-1" }),
    });
    expect(result.competency).toBe("2026-07");
  });

  it("stages a valid file without persisting plaintext enrollment numbers", async () => {
    const { service, transaction, protection } = setup();

    const result = await service.uploadMarginFile(
      "agreement-1",
      "cycle-1",
      { layoutVersion: "MARGIN_V1", environment: "HOMOLOGATION", description: "Teste" },
      "margin-2026-07-001",
      { buffer: csv, originalname: "margem.csv", mimetype: "text/csv", size: csv.length },
      context,
    );

    const row = transaction.payrollFileRow.createMany.mock.calls[0]![0].data[0];
    expect(row.enrollmentId).toBe("enrollment-1");
    expect(row.normalizedData).not.toHaveProperty("enrollmentNumber");
    expect(JSON.stringify(row)).not.toContain('"MAT-123"');
    expect(protection.encrypt).toHaveBeenCalledWith(expect.stringContaining("MAT-123"), "payroll.margin_row");
    expect(result).toMatchObject({ status: "VALIDATED", validRows: 1, duplicate: false });
  });

  it("rejects the complete staging when an enrollment is unknown", async () => {
    const { service, prisma, transaction } = setup();
    prisma.enrollment.findMany.mockResolvedValue([]);
    transaction.payrollFile.create.mockResolvedValue({
      ...storedFile,
      status: "REJECTED",
      validRows: 0,
      invalidRows: 1,
    });

    const result = await service.uploadMarginFile(
      "agreement-1",
      "cycle-1",
      { layoutVersion: "MARGIN_V1", environment: "HOMOLOGATION", description: "Teste" },
      "margin-2026-07-002",
      { buffer: csv, originalname: "margem.csv", mimetype: "text/csv", size: csv.length },
      context,
    );

    expect(transaction.payrollFileRow.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      enrollmentId: null,
      status: "INVALID",
      errors: ["matricula: nao cadastrada no convenio"],
    });
    expect(result.status).toBe("REJECTED");
  });

  it("returns the original protocol without processing a repeated idempotency key", async () => {
    const { service, prisma, transaction } = setup();
    prisma.payrollFile.findFirst.mockResolvedValue(storedFile);

    const result = await service.uploadMarginFile(
      "agreement-1",
      "cycle-1",
      { layoutVersion: "MARGIN_V1", environment: "HOMOLOGATION", description: "Reenvio" },
      "margin-2026-07-001",
      { buffer: csv, originalname: "margem.csv", mimetype: "text/csv", size: csv.length },
      context,
    );

    expect(result).toMatchObject({ id: "file-1", duplicate: true });
    expect(transaction.payrollFile.create).not.toHaveBeenCalled();
    expect(transaction.payrollFileRow.createMany).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key reused for different file content", async () => {
    const { service, prisma, transaction } = setup();
    prisma.payrollFile.findFirst.mockResolvedValue({
      ...storedFile,
      idempotencyKey: "margin-2026-07-001",
      fileType: "MARGIN",
      contentHash: "different-content",
    });

    await expect(service.uploadMarginFile(
      "agreement-1",
      "cycle-1",
      { layoutVersion: "MARGIN_V1", environment: "HOMOLOGATION", description: "Reuso incorreto" },
      "margin-2026-07-001",
      { buffer: csv, originalname: "margem.csv", mimetype: "text/csv", size: csv.length },
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.payrollFile.create).not.toHaveBeenCalled();
  });

  it("excludes contracts with unresolved payroll exceptions from insertion", async () => {
    const transaction = {
      payrollCycle: { findFirst: vi.fn().mockResolvedValue({
        ...cycle,
        status: "PUBLISHED",
        policyVersion: {
          id: "policy-1",
          payload: {
            marginConsultationAuthorization: "NOT_REQUIRED",
            reservationConfirmation: "IMMEDIATE",
            reservationValidityMinutes: 1440,
            confirmationCodeValidityMinutes: 10,
            confirmationMaxAttempts: 5,
            cutoffDay: 20,
            enabledProductFamilies: ["PAYROLL_LOAN"],
            eligibleFunctionalStatuses: ["ACTIVE"],
            requiredContractFields: ["CET"],
            publicServantValidation: { enabled: false },
            marginGroups: [{
              code: "LOAN",
              name: "Emprestimo",
              percentage: 35,
              sharingMode: "SEPARATE",
              productFamilies: ["PAYROLL_LOAN"],
              payrollRubricCode: "9001",
            }],
          },
        },
      }) },
      payrollFile: { findFirst: vi.fn().mockResolvedValue(null) },
      contract: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = {
      payrollFile: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new PayrollService(prisma, {} as DataProtectionService);

    await expect(service.generateInsertionFile(
      "agreement-1",
      "cycle-1",
      { layoutVersion: "INSERTION_V1", environment: "HOMOLOGATION" },
      "insertion-2026-07-001",
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        payrollDiscountEvents: {
          none: {
            outcome: "REJECTED",
            exceptionStatus: { in: ["OPEN", "IN_REVIEW"] },
          },
        },
      }),
    }));
  });

  it("advances a partial installment and accumulates only its shortfall", async () => {
    const returnData = {
      partyDocument: "12345678000190",
      contractNumber: "CT-001",
      competency: "2026-07",
      installmentNumber: 4,
      expectedAmount: "200.00",
      discountedAmount: "80.00",
      outcome: "PARTIAL",
      reason: "Margem insuficiente",
      instructionId: "instruction-1",
    };
    const file = {
      ...storedFile,
      fileType: "RETURN",
      status: "VALIDATED",
      rows: [{
        id: "row-1",
        status: "VALID",
        normalizedData: returnData,
      }],
    };
    const contract = {
      id: "contract-1",
      status: "ACTIVE",
      version: 7,
      currentInstallment: 3,
      fullyPaidInstallments: 3,
      totalDiscountedAmount: decimal("600.00"),
      arrearsAmount: decimal("0.00"),
      termInstallments: 12,
      installmentAmount: decimal("200.00"),
      product: { chargeMode: "FIXED_INSTALLMENTS" },
      marginAccount: {
        id: "account-1",
        lockVersion: 2,
        totalAmount: decimal("1000.00"),
        consumedAmount: decimal("200.00"),
        reservedAmount: decimal("0.00"),
        blockedAmount: decimal("0.00"),
        availableAmount: decimal("800.00"),
      },
    };
    const transaction = {
      payrollFile: {
        findFirst: vi.fn().mockResolvedValue(file),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ ...file, status: "APPLIED", processedAt: new Date() }),
      },
      payrollInstruction: {
        findFirst: vi.fn().mockResolvedValue({
          id: "instruction-1",
          agreementId: "agreement-1",
          payrollCycleId: "cycle-1",
          enrollmentId: "enrollment-1",
          installmentNumber: 4,
          status: "GENERATED",
          contract,
        }),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      payrollDiscountEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
      contract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      marginAccount: { updateMany: vi.fn() },
      marginMovement: { create: vi.fn() },
      payrollFileRow: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      payrollCycle: { update: vi.fn().mockResolvedValue({}) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new PayrollService(prisma, {} as DataProtectionService);

    const result = await service.applyReturnFile("agreement-1", "cycle-1", "file-1", context);

    expect(transaction.contract.updateMany).toHaveBeenCalledWith({
      where: { id: "contract-1", status: "ACTIVE", version: 7 },
      data: expect.objectContaining({
        currentInstallment: 4,
        fullyPaidInstallments: 3,
        totalDiscountedAmount: "680.00",
        arrearsAmount: "120.00",
        status: "ACTIVE",
        version: { increment: 1 },
      }),
    });
    expect(transaction.marginAccount.updateMany).not.toHaveBeenCalled();
    expect("reconciliation" in result).toBe(true);
    if ("reconciliation" in result) {
      expect(result.reconciliation).toMatchObject({ partial: 1, settled: 0 });
    }
  });

  it("creates a before/after snapshot before applying a validated row", async () => {
    const { service, transaction } = setup();
    transaction.payrollFile.findFirst.mockResolvedValue({
      ...storedFile,
      fileType: "MARGIN",
      rows: [
        {
          id: "row-1",
          enrollmentId: "enrollment-1",
          status: "VALID",
          normalizedData: {
            functionalStatus: "ACTIVE",
            employmentType: "EFFECTIVE",
            payrollGroup: null,
            department: "Saude",
            costCenter: null,
            baseSalary: "5000.00",
            mandatoryDeductions: "900.00",
            marginBase: "4100.00",
            sourceUpdatedAt: "2026-07-20T12:00:00Z",
          },
        },
      ],
    });
    transaction.enrollment.findFirst.mockResolvedValue({
      id: "enrollment-1",
      functionalStatus: "LEAVE",
      employmentType: "EFFECTIVE",
      payrollGroup: null,
      department: "Administracao",
      costCenter: null,
      baseSalary: { toString: () => "4800.00" },
      mandatoryDeductions: { toString: () => "800.00" },
      marginBase: { toString: () => "4000.00" },
      sourceUpdatedAt: null,
      version: 2,
    });

    const result = await service.publishMarginFile("agreement-1", "cycle-1", "file-1", context);

    expect(transaction.enrollmentPayrollSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceFileRowId: "row-1",
        beforeData: expect.objectContaining({ functionalStatus: "LEAVE", version: 2 }),
        afterData: expect.objectContaining({ marginBase: "4100.00" }),
      }),
    });
    expect(transaction.enrollment.update).toHaveBeenCalledWith({
      where: { id: "enrollment-1" },
      data: expect.objectContaining({ marginBase: "4100.00", version: { increment: 1 } }),
    });
    expect(result).toMatchObject({ status: "APPLIED", duplicate: false });
  });

  it("does not publish a rejected file", async () => {
    const { service, transaction } = setup();
    transaction.payrollFile.findFirst.mockResolvedValue({
      ...storedFile,
      status: "REJECTED",
      invalidRows: 1,
      rows: [],
    });

    await expect(
      service.publishMarginFile("agreement-1", "cycle-1", "file-1", context),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.enrollment.update).not.toHaveBeenCalled();
  });

  it("builds a safe operational projection without enrollment identifiers", async () => {
    const party = { id: "party-1", tradeName: "Banco Teste", legalName: "Banco Teste SA" };
    const product = { id: "product-1", code: "LOAN", name: "Emprestimo", family: "PAYROLL_LOAN" };
    const contract = { id: "contract-1", contractNumber: "CT-001", party, product };
    const prisma = {
      payrollCycle: { findFirst: vi.fn().mockResolvedValue(cycle) },
      payrollFile: { findMany: vi.fn().mockResolvedValue([]) },
      payrollInstruction: {
        aggregate: vi.fn().mockResolvedValue({ _count: { _all: 3 }, _sum: { amount: decimal("600.00") } }),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
        findMany: vi.fn().mockResolvedValue([{
          id: "instruction-1",
          contractId: contract.id,
          installmentNumber: 2,
          amount: decimal("200.00"),
          contract,
        }]),
      },
      payrollDiscountEvent: {
        count: vi.fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { discountedAmount: decimal("280.00") } }),
        findMany: vi.fn()
          .mockResolvedValueOnce([{
            installmentNumber: 12,
            contract: { termInstallments: 12, product: { chargeMode: "FIXED_INSTALLMENTS" } },
          }])
          .mockResolvedValueOnce([{
            id: "event-1",
            contractId: contract.id,
            contract,
            outcome: "PARTIAL",
            installmentNumber: 1,
            expectedAmount: decimal("200.00"),
            discountedAmount: decimal("80.00"),
            reason: "Margem insuficiente",
            processedAt: new Date("2026-07-31T12:00:00.000Z"),
          }]),
      },
    } as unknown as PrismaService;
    const service = new PayrollService(prisma, {} as DataProtectionService);

    const result = await service.getOperations("agreement-1", "cycle-1");
    const serialized = JSON.stringify(result);

    expect(result.summary).toMatchObject({
      instructed: 3,
      pending: 1,
      reconciled: 2,
      full: 1,
      partial: 1,
      settledContracts: 1,
      openExceptions: 1,
      inReviewExceptions: 0,
      instructedAmount: "600.00",
      discountedAmount: "280.00",
    });
    expect(result.pendingInstructions[0]).toMatchObject({ contractNumber: "CT-001", amount: "200.00" });
    expect(result.exceptions[0]).toMatchObject({ outcome: "PARTIAL", reason: "Margem insuficiente" });
    expect(serialized).not.toContain("enrollmentId");
    expect(serialized).not.toContain("matricula");
    expect(serialized).not.toContain("rawData");
  });

  it("claims a payroll exception without changing contract or margin balances", async () => {
    const event = {
      id: "event-1",
      agreementId: "agreement-1",
      payrollCycleId: "cycle-1",
      contractId: "contract-1",
      outcome: "REJECTED",
      installmentNumber: 2,
      expectedAmount: decimal("200.00"),
      discountedAmount: decimal("0.00"),
      reason: "Afastamento",
      exceptionStatus: "OPEN",
      acknowledgedAt: null,
      acknowledgedBy: null,
      reviewNoteEncrypted: null,
      reviewVersion: 1,
      processedAt: new Date("2026-07-31T12:00:00.000Z"),
      contract: {
        contractNumber: "CT-001",
        party: { id: "party-1", tradeName: "Banco Teste", legalName: "Banco Teste SA" },
        product: { id: "product-1", code: "LOAN", name: "Emprestimo", family: "PAYROLL_LOAN" },
      },
    };
    const updated = {
      ...event,
      exceptionStatus: "IN_REVIEW",
      acknowledgedAt: new Date("2026-08-01T10:00:00.000Z"),
      acknowledgedBy: { id: "user-1", name: "Gestora" },
      reviewNoteEncrypted: "protected-note",
      reviewVersion: 2,
    };
    const transaction = {
      payrollDiscountEvent: {
        findFirst: vi.fn().mockResolvedValue(event),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const protection = {
      encrypt: vi.fn().mockReturnValue("protected-note"),
      decrypt: vi.fn().mockReturnValue("Analisar afastamento"),
    } as unknown as DataProtectionService;
    const service = new PayrollService(prisma, protection);

    const result = await service.acknowledgeException(
      "agreement-1",
      "cycle-1",
      "event-1",
      { note: "Analisar afastamento" },
      context,
    );

    expect(transaction.payrollDiscountEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", exceptionStatus: "OPEN", reviewVersion: 1 },
      data: expect.objectContaining({
        exceptionStatus: "IN_REVIEW",
        acknowledgedByUserId: "user-1",
        reviewNoteEncrypted: "protected-note",
        reviewVersion: { increment: 1 },
      }),
    });
    expect(protection.encrypt).toHaveBeenCalledWith("Analisar afastamento", "payroll.exception_note");
    expect(transaction).not.toHaveProperty("contract");
    expect(transaction).not.toHaveProperty("marginAccount");
    expect(result).toMatchObject({ exceptionStatus: "IN_REVIEW", duplicate: false });
  });

  it("rejects a concurrent attempt to claim the same payroll exception", async () => {
    const transaction = {
      payrollDiscountEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "event-1",
          agreementId: "agreement-1",
          payrollCycleId: "cycle-1",
          contractId: "contract-1",
          outcome: "PARTIAL",
          exceptionStatus: "OPEN",
          reviewVersion: 3,
          contract: {},
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const protection = { encrypt: vi.fn().mockReturnValue("protected-note") } as unknown as DataProtectionService;
    const service = new PayrollService(prisma, protection);

    await expect(service.acknowledgeException(
      "agreement-1",
      "cycle-1",
      "event-1",
      { note: "Revisao concorrente" },
      context,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it("resolves a rejected zero-value exception for retry without changing financial state", async () => {
    const event = {
      id: "event-1",
      agreementId: "agreement-1",
      payrollCycleId: "cycle-1",
      contractId: "contract-1",
      outcome: "REJECTED",
      installmentNumber: 2,
      expectedAmount: decimal("200.00"),
      discountedAmount: decimal("0.00"),
      reason: "Afastamento",
      exceptionStatus: "IN_REVIEW",
      acknowledgedAt: new Date("2026-08-01T09:00:00.000Z"),
      acknowledgedBy: { id: "reviewer-1", name: "Revisora" },
      reviewNoteEncrypted: "review-note",
      resolutionAction: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNoteEncrypted: null,
      reviewVersion: 2,
      processedAt: new Date("2026-07-31T12:00:00.000Z"),
      contract: {
        contractNumber: "CT-001",
        party: { id: "party-1", tradeName: "Banco Teste", legalName: "Banco Teste SA" },
        product: { id: "product-1", code: "LOAN", name: "Emprestimo", family: "PAYROLL_LOAN" },
      },
    };
    const updated = {
      ...event,
      exceptionStatus: "RESOLVED",
      resolutionAction: "RETRY_NEXT_CYCLE",
      resolvedAt: new Date("2026-08-01T10:00:00.000Z"),
      resolvedBy: { id: "user-1", name: "Gestora" },
      resolutionNoteEncrypted: "resolution-note",
      reviewVersion: 3,
    };
    const transaction = {
      payrollDiscountEvent: {
        findFirst: vi.fn().mockResolvedValue(event),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const protection = {
      encrypt: vi.fn().mockReturnValue("resolution-note"),
      decrypt: vi.fn().mockReturnValue("Reapresentar apos retorno da folha"),
    } as unknown as DataProtectionService;
    const service = new PayrollService(prisma, protection);

    const result = await service.resolveException(
      "agreement-1",
      "cycle-1",
      "event-1",
      { action: "RETRY_NEXT_CYCLE", note: "Reapresentar apos retorno da folha" },
      context,
    );

    expect(transaction.payrollDiscountEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", exceptionStatus: "IN_REVIEW", reviewVersion: 2 },
      data: expect.objectContaining({
        exceptionStatus: "RESOLVED",
        resolutionAction: "RETRY_NEXT_CYCLE",
        resolvedByUserId: "user-1",
        resolutionNoteEncrypted: "resolution-note",
        reviewVersion: { increment: 1 },
      }),
    });
    expect(transaction).not.toHaveProperty("contract");
    expect(transaction).not.toHaveProperty("marginAccount");
    expect(result).toMatchObject({
      exceptionStatus: "RESOLVED",
      resolutionAction: "RETRY_NEXT_CYCLE",
      duplicate: false,
    });
  });

  it("keeps partial discounts blocked from retry resolution", async () => {
    const transaction = {
      payrollDiscountEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "event-1",
          agreementId: "agreement-1",
          payrollCycleId: "cycle-1",
          contractId: "contract-1",
          outcome: "PARTIAL",
          discountedAmount: decimal("80.00"),
          exceptionStatus: "IN_REVIEW",
          reviewVersion: 2,
          contract: {},
        }),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new PayrollService(prisma, {} as DataProtectionService);

    await expect(service.resolveException(
      "agreement-1",
      "cycle-1",
      "event-1",
      { action: "RETRY_NEXT_CYCLE", note: "Tentar cobrar novamente" },
      context,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.payrollDiscountEvent.updateMany).not.toHaveBeenCalled();
  });
});
