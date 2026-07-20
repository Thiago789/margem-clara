import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DataProtectionService } from "../platform/crypto/data-protection.service.js";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { ServantsService } from "./servants.service.js";

const context: RequestContext = {
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
  actor: { userId: "user-1", role: "agreement_manager", memberships: [] },
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

const input = {
  fullName: "Maria da Silva",
  cpf: "529.982.247-25",
  birthDate: "1985-04-12",
  email: "MARIA@example.test",
  phone: "(85) 99999-1234",
  enrollmentNumber: " mat-123 ",
  functionalStatus: "ACTIVE",
  employmentType: "EFFECTIVE",
  admissionDate: "2010-01-10",
  baseSalary: "5000.00",
  mandatoryDeductions: "900.00",
  marginBase: "4100.00",
};

const person = {
  id: "person-1",
  fullName: "Maria da Silva",
  socialName: null,
  cpfEncrypted: "enc:person.cpf:52998224725",
  cpfLookupHash: "hash:person.cpf:52998224725",
  birthDate: new Date("1985-04-12T00:00:00.000Z"),
  emailEncrypted: "enc:person.email:maria@example.test",
  phoneEncrypted: "enc:person.phone:85999991234",
  status: "ACTIVE",
  createdAt: new Date("2026-07-20T20:00:00.000Z"),
  updatedAt: new Date("2026-07-20T20:00:00.000Z"),
  version: 1,
};

function decimal(value: string) {
  return { toString: () => value };
}

function enrollmentRow() {
  return {
    id: "enrollment-1",
    agreementId: "agreement-1",
    personId: person.id,
    enrollmentNumberEncrypted: "enc:enrollment.number:MAT-123",
    enrollmentLookupKey: "hash:enrollment.number:MAT-123",
    functionalStatus: "ACTIVE",
    employmentType: "EFFECTIVE",
    admissionDate: new Date("2010-01-10T00:00:00.000Z"),
    terminationDate: null,
    payrollGroup: null,
    department: null,
    costCenter: null,
    baseSalary: decimal("5000.00"),
    mandatoryDeductions: decimal("900.00"),
    marginBase: decimal("4100.00"),
    sourceUpdatedAt: null,
    status: "ACTIVE",
    createdAt: new Date("2026-07-20T20:00:00.000Z"),
    updatedAt: new Date("2026-07-20T20:00:00.000Z"),
    version: 1,
    person,
  };
}

function setup(options: { duplicate?: boolean } = {}) {
  const transaction = {
    agreement: {
      findUnique: vi.fn().mockResolvedValue({ id: "agreement-1", status: "ACTIVE" }),
    },
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(options.duplicate ? { id: "existing" } : null),
      create: vi.fn().mockResolvedValue(enrollmentRow()),
    },
    person: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(person),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    ),
    enrollment: {
      findMany: vi.fn().mockResolvedValue([enrollmentRow()]),
      findFirst: vi.fn().mockResolvedValue(enrollmentRow()),
    },
  } as unknown as PrismaService;
  const protection = {
    encrypt: vi.fn((value: string, purpose: string) => `enc:${purpose}:${value}`),
    decrypt: vi.fn((value: string) => value.split(":").slice(2).join(":")),
    lookupHash: vi.fn((value: string, purpose: string) => `hash:${purpose}:${value}`),
  } as unknown as DataProtectionService;
  return {
    service: new ServantsService(prisma, protection),
    prisma: prisma as any,
    protection: protection as any,
    transaction,
  };
}

describe("ServantsService", () => {
  it("protects identifiers and records an audit event without personal data", async () => {
    const { service, protection, transaction } = setup();

    const result = await service.create("agreement-1", input, context);

    expect(protection.encrypt).toHaveBeenCalledWith("52998224725", "person.cpf");
    expect(protection.encrypt).toHaveBeenCalledWith("MAT-123", "enrollment.number");
    expect(transaction.person.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cpfEncrypted: "enc:person.cpf:52998224725",
        cpfLookupHash: "hash:person.cpf:52998224725",
      }),
    });
    const auditData = transaction.auditEvent.create.mock.calls[0]![0].data;
    expect(JSON.stringify(auditData)).not.toContain("52998224725");
    expect(JSON.stringify(auditData)).not.toContain("MAT-123");
    expect(result.person.cpfMasked).toBe("***.***.***-25");
    expect(result.enrollmentNumberMasked).toBe("****-123");
    expect(result).not.toHaveProperty("enrollmentNumberEncrypted");
  });

  it("rejects an invalid CPF before starting a transaction", async () => {
    const { service, prisma } = setup();

    await expect(
      service.create("agreement-1", { ...input, cpf: "111.111.111-11" }, context),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects inconsistent payroll values before persistence", async () => {
    const { service, prisma } = setup();

    await expect(
      service.create(
        "agreement-1",
        { ...input, baseSalary: "1000.00", mandatoryDeductions: "1000.01" },
        context,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a duplicate enrollment inside the agreement", async () => {
    const { service, transaction } = setup({ duplicate: true });

    await expect(service.create("agreement-1", input, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.person.create).not.toHaveBeenCalled();
  });

  it("lists only safe projections without encrypted or lookup fields", async () => {
    const { service } = setup();

    const [result] = await service.list("agreement-1", 50);
    const serialized = JSON.stringify(result);

    expect(result!.person.fullName).toBe("Maria da Silva");
    expect(serialized).not.toContain("cpfEncrypted");
    expect(serialized).not.toContain("Lookup");
    expect(serialized).not.toContain("52998224725");
  });

  it("uses protected exact indexes when locating a servant", async () => {
    const { service, prisma } = setup();

    await service.lookup("agreement-1", { cpf: "529.982.247-25", enrollmentNumber: "mat-123" });

    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: {
        agreementId: "agreement-1",
        enrollmentLookupKey: "hash:enrollment.number:MAT-123",
        person: { cpfLookupHash: "hash:person.cpf:52998224725" },
      },
      include: { person: true },
    });
  });
});
