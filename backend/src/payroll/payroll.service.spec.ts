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
});
