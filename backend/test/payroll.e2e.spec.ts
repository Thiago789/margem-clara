import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";
import { PayrollService } from "../src/payroll/payroll.service.js";

const agreementId = "1a3c8d1e-c8ca-4551-9448-31476c575ef5";
const otherAgreementId = "6b194810-5e29-4b51-92b2-037120b1c896";
const cycleId = "2312f48d-d3c7-43c5-aed5-2cbc09a8f353";
const fileId = "40f76a2a-7724-4f93-a7eb-d0d72c73520d";
const eventId = "af21b950-5778-40d8-9ca8-df266f441837";
const actor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "agreement_manager",
  memberships: [
    {
      agreementId,
      partyId: null,
      permissions: new Set(["payroll:read", "payroll:write", "payroll:approve"]),
    },
  ],
};

describe("payroll endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const payroll = {
    createCycle: vi.fn(),
    listCycles: vi.fn(),
    listFiles: vi.fn(),
    getOperations: vi.fn(),
    listExceptions: vi.fn(),
    acknowledgeException: vi.fn(),
    resolveException: vi.fn(),
    uploadMarginFile: vi.fn(),
    getFile: vi.fn(),
    publishMarginFile: vi.fn(),
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
      .overrideProvider(PayrollService)
      .useValue(payroll)
      .overrideProvider(AuditService)
      .useValue(audit)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it("requires a session before listing payroll cycles", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/payroll-cycles`)
      .expect(401);
  });

  it("passes the CSV and idempotency key to the scoped service", async () => {
    auth.authenticate.mockResolvedValue(actor);
    payroll.uploadMarginFile.mockResolvedValue({ id: fileId, status: "VALIDATED" });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/margin-files`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "margin-2026-07-001")
      .field("layoutVersion", "MARGIN_V1")
      .field("environment", "HOMOLOGATION")
      .attach("file", Buffer.from("a;b\n1;2"), { filename: "margem.csv", contentType: "text/csv" })
      .expect(201);

    expect(payroll.uploadMarginFile).toHaveBeenCalledWith(
      agreementId,
      cycleId,
      expect.objectContaining({ layoutVersion: "MARGIN_V1", environment: "HOMOLOGATION" }),
      "margin-2026-07-001",
      expect.objectContaining({ originalname: "margem.csv" }),
      expect.any(Object),
    );
  });

  it("denies publication in another agreement and audits the attempt", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(
        `/api/v1/agreements/${otherAgreementId}/payroll-cycles/${cycleId}/files/${fileId}/publish`,
      )
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(payroll.publishMarginFile).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "payroll:approve" }),
    );
  });

  it("returns the operational cycle view to an agreement-wide manager", async () => {
    auth.authenticate.mockResolvedValue(actor);
    payroll.getOperations.mockResolvedValue({ summary: { pending: 2 }, files: [] });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/operations`)
      .set("Cookie", "mc_session=session-value")
      .expect(200)
      .expect(({ body }) => expect(body.summary.pending).toBe(2));

    expect(payroll.getOperations).toHaveBeenCalledWith(agreementId, cycleId);
  });

  it("denies the agreement-wide cycle view to a party-scoped membership", async () => {
    auth.authenticate.mockResolvedValue({
      ...actor,
      role: "consignee_operator",
      memberships: [{
        agreementId,
        partyId: "0d9e33ea-838a-4dbd-a1d6-c78cd4b7847d",
        permissions: new Set(["payroll:read"]),
      }],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/operations`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(payroll.getOperations).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "payroll:read" }),
    );
  });

  it("allows an agreement manager to assume a payroll exception", async () => {
    auth.authenticate.mockResolvedValue(actor);
    payroll.acknowledgeException.mockResolvedValue({ id: eventId, exceptionStatus: "IN_REVIEW" });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/exceptions/${eventId}/acknowledge`)
      .set("Cookie", "mc_session=session-value")
      .send({ note: "Validar afastamento informado pela folha" })
      .expect(201)
      .expect(({ body }) => expect(body.exceptionStatus).toBe("IN_REVIEW"));

    expect(payroll.acknowledgeException).toHaveBeenCalledWith(
      agreementId,
      cycleId,
      eventId,
      { note: "Validar afastamento informado pela folha" },
      expect.any(Object),
    );
  });

  it("rejects an exception acknowledgement without a meaningful note", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/exceptions/${eventId}/acknowledge`)
      .set("Cookie", "mc_session=session-value")
      .send({ note: "x" })
      .expect(400);

    expect(payroll.acknowledgeException).not.toHaveBeenCalled();
  });

  it("allows an agreement manager to resolve a rejected exception for retry", async () => {
    auth.authenticate.mockResolvedValue(actor);
    payroll.resolveException.mockResolvedValue({
      id: eventId,
      exceptionStatus: "RESOLVED",
      resolutionAction: "RETRY_NEXT_CYCLE",
    });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/exceptions/${eventId}/resolve`)
      .set("Cookie", "mc_session=session-value")
      .send({ action: "RETRY_NEXT_CYCLE", note: "Reapresentar no proximo ciclo" })
      .expect(201)
      .expect(({ body }) => expect(body.exceptionStatus).toBe("RESOLVED"));

    expect(payroll.resolveException).toHaveBeenCalledWith(
      agreementId,
      cycleId,
      eventId,
      { action: "RETRY_NEXT_CYCLE", note: "Reapresentar no proximo ciclo" },
      expect.any(Object),
    );
  });
});
