import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractsService } from "../src/contracts/contracts.service.js";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";

const agreementId = "1a3c8d1e-c8ca-4551-9448-31476c575ef5";
const partyId = "0d9e33ea-838a-4dbd-a1d6-c78cd4b7847d";
const otherPartyId = "dad3ae65-1f79-4a60-8f02-d48e59f73ca3";
const reservationId = "23e03a91-df6e-4437-ae92-630c4f0fe3c0";
const actor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "consignee_operator",
  memberships: [{
    agreementId,
    partyId,
    permissions: new Set(["contracts:create", "contracts:read", "contracts:recover"]),
  }],
};
const agreementManager = {
  userId: "a7df1711-866a-4247-b66f-5054f88f5822",
  role: "agreement_manager",
  memberships: [{
    agreementId,
    partyId: null,
    permissions: new Set(["contracts:read"]),
  }],
};

describe("contract endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const contracts = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    getArrearsOverview: vi.fn(),
    listArrearsPayments: vi.fn(),
    recordArrearsPayment: vi.fn(),
    reverseArrearsPayment: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/margem_clara_test";
    process.env.AUTH_LOOKUP_SECRET = "test-only-auth-lookup-secret-at-least-32-characters";
    process.env.DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    process.env.DATA_LOOKUP_SECRET = "test-only-data-lookup-secret-at-least-32-characters";

    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(auth)
      .overrideProvider(ContractsService)
      .useValue(contracts)
      .overrideProvider(AuditService)
      .useValue(audit)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it("requires a session before listing contracts", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/parties/${partyId}/contracts`)
      .expect(401);
  });

  it("creates a contract from a reservation inside the party scope", async () => {
    auth.authenticate.mockResolvedValue(actor);
    contracts.create.mockResolvedValue({ id: "contract-1", status: "ACTIVE" });
    const body = {
      reservationId,
      contractNumber: "CT-001",
      operationType: "NEW",
      contractValue: "10000.00",
      termInstallments: 60,
      cetAnnual: "18.5",
      firstDueDate: "2026-08-10",
      firstCompetency: "2026-08",
    };

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/parties/${partyId}/contracts`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "contract-request-1")
      .send(body)
      .expect(201);

    expect(contracts.create).toHaveBeenCalledWith(
      agreementId,
      partyId,
      body,
      "contract-request-1",
      expect.any(Object),
    );
  });

  it("denies contract creation for another consignee", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/parties/${otherPartyId}/contracts`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "contract-request-2")
      .send({ reservationId, contractNumber: "CT-002", operationType: "NEW" })
      .expect(403);

    expect(contracts.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "contracts:create" }),
    );
  });

  it("returns the arrears overview only inside the consignee scope", async () => {
    auth.authenticate.mockResolvedValue(actor);
    contracts.getArrearsOverview.mockResolvedValue({
      summary: { contractsWithArrears: 2, totalArrearsAmount: "180.00" },
      contracts: [],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/parties/${partyId}/contracts/arrears`)
      .query({ productFamily: "PAYROLL_LOAN", minArrears: "50.00", limit: "25" })
      .set("Cookie", "mc_session=session-value")
      .expect(200)
      .expect(({ body }) => expect(body.summary.contractsWithArrears).toBe(2));

    expect(contracts.getArrearsOverview).toHaveBeenCalledWith(
      agreementId,
      partyId,
      expect.objectContaining({
        productFamily: "PAYROLL_LOAN",
        minArrears: "50.00",
        limit: 25,
      }),
    );
  });

  it("denies a party-scoped operator access to the agreement-wide arrears overview", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/contracts/arrears`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(contracts.getArrearsOverview).not.toHaveBeenCalled();
  });

  it("allows an agreement manager to filter the wide overview by consignee", async () => {
    auth.authenticate.mockResolvedValue(agreementManager);
    contracts.getArrearsOverview.mockResolvedValue({
      summary: { contractsWithArrears: 1, totalArrearsAmount: "60.00" },
      contracts: [],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/contracts/arrears`)
      .query({ partyId, status: "PAYROLL_COMPLETED_WITH_ARREARS" })
      .set("Cookie", "mc_session=session-value")
      .expect(200);

    expect(contracts.getArrearsOverview).toHaveBeenCalledWith(
      agreementId,
      partyId,
      expect.objectContaining({ status: "PAYROLL_COMPLETED_WITH_ARREARS" }),
    );
  });

  it("allows the scoped consignee to record an external arrears payment", async () => {
    auth.authenticate.mockResolvedValue(actor);
    contracts.recordArrearsPayment.mockResolvedValue({
      id: "payment-1",
      amount: "80.00",
      arrearsAfter: "0.00",
    });

    const body = {
      amount: "80.00",
      method: "PIX",
      paidAt: "2026-07-23T10:00:00Z",
      externalReference: "PIX-001",
    };
    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/parties/${partyId}/contracts/40f76a2a-7724-4f93-a7eb-d0d72c73520d/arrears-payments`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "arrears-payment-001")
      .send(body)
      .expect(201);

    expect(contracts.recordArrearsPayment).toHaveBeenCalledWith(
      agreementId,
      partyId,
      "40f76a2a-7724-4f93-a7eb-d0d72c73520d",
      body,
      "arrears-payment-001",
      expect.any(Object),
    );
  });

  it("allows the scoped consignee to reverse an arrears payment with justification", async () => {
    auth.authenticate.mockResolvedValue(actor);
    contracts.reverseArrearsPayment.mockResolvedValue({
      id: "reversal-1",
      paymentId: "2ee6e3bc-c717-4ca4-9d96-34629bd87f47",
      arrearsAfter: "80.00",
    });
    const body = { reason: "Pagamento cancelado pela instituicao" };

    await request(app.getHttpServer())
      .post(
        `/api/v1/agreements/${agreementId}/parties/${partyId}` +
        `/contracts/40f76a2a-7724-4f93-a7eb-d0d72c73520d` +
        `/arrears-payments/2ee6e3bc-c717-4ca4-9d96-34629bd87f47/reverse`,
      )
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "arrears-reversal-001")
      .send(body)
      .expect(201);

    expect(contracts.reverseArrearsPayment).toHaveBeenCalledWith(
      agreementId,
      partyId,
      "40f76a2a-7724-4f93-a7eb-d0d72c73520d",
      "2ee6e3bc-c717-4ca4-9d96-34629bd87f47",
      body,
      "arrears-reversal-001",
      expect.any(Object),
    );
  });
});
