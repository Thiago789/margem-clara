import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { AgreementsService } from "./agreements.service.js";

const context: RequestContext = {
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
  actor: { userId: "user-1", role: "platform_admin", memberships: [] },
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

const validPolicy = {
  marginConsultationAuthorization: "NOT_REQUIRED",
  reservationConfirmation: "IMMEDIATE",
  cutoffDay: 20,
  enabledProductFamilies: ["PAYROLL_LOAN"],
  requiredContractFields: ["CET", "FIRST_DUE_DATE"],
  publicServantValidation: { enabled: false },
};

function setup() {
  const transaction = {
    organization: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "organization-1", status: "ACTIVE" }),
    },
    agreement: {
      create: vi.fn().mockResolvedValue({ id: "agreement-1", name: "Convenio Piloto" }),
      findUnique: vi.fn().mockResolvedValue({ id: "agreement-1" }),
    },
    agreementPolicyVersion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    ),
  } as unknown as PrismaService;
  return { service: new AgreementsService(prisma), prisma: prisma as any, transaction };
}

describe("AgreementsService", () => {
  it("creates organization, agreement and audit evidence atomically", async () => {
    const { service, prisma, transaction } = setup();
    const input = {
      organizationName: "Prefeitura Piloto",
      organizationDocumentNumber: "12345678000199",
      organizationType: "MUNICIPALITY",
      tenantKey: "prefeitura-piloto",
      code: "piloto",
      name: "Convenio Piloto",
      timezone: "America/Fortaleza",
    };

    await service.create(input, context);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transaction.agreement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "organization-1",
        tenantKey: "prefeitura-piloto",
        code: "PILOTO",
      }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "agreement.create", agreementId: "agreement-1" }),
    });
  });

  it("creates the next immutable policy version as a draft", async () => {
    const { service, transaction } = setup();
    transaction.agreementPolicyVersion.findFirst.mockResolvedValue({ versionNumber: 2 });
    transaction.agreementPolicyVersion.create.mockResolvedValue({
      id: "policy-3",
      policyType: "OPERATIONAL_RULES",
      versionNumber: 3,
    });

    const result = await service.createPolicy(
      "agreement-1",
      { policyType: "OPERATIONAL_RULES", payload: validPolicy },
      context,
    );

    expect(transaction.agreementPolicyVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        versionNumber: 3,
        payload: {
          ...validPolicy,
          eligibleFunctionalStatuses: ["ACTIVE"],
          reservationValidityMinutes: 1_440,
          confirmationCodeValidityMinutes: 10,
          confirmationMaxAttempts: 5,
        },
      }),
    });
    expect(result).toMatchObject({ id: "policy-3", versionNumber: 3 });
  });

  it("expires the previous active policy before activating a draft", async () => {
    const { service, transaction } = setup();
    transaction.agreementPolicyVersion.findFirst.mockResolvedValue({
      id: "policy-3",
      policyType: "OPERATIONAL_RULES",
      versionNumber: 3,
      status: "DRAFT",
    });
    transaction.agreementPolicyVersion.update.mockResolvedValue({
      id: "policy-3",
      status: "ACTIVE",
    });

    await service.activatePolicy("agreement-1", "policy-3", context);

    expect(transaction.agreementPolicyVersion.updateMany).toHaveBeenCalledWith({
      where: {
        agreementId: "agreement-1",
        policyType: "OPERATIONAL_RULES",
        status: "ACTIVE",
      },
      data: { status: "EXPIRED", validUntil: expect.any(Date) },
    });
    expect(transaction.agreementPolicyVersion.update).toHaveBeenCalledWith({
      where: { id: "policy-3" },
      data: expect.objectContaining({ status: "ACTIVE", approvedByUserId: "user-1" }),
    });
  });
});
