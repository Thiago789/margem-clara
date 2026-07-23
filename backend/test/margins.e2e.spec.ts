import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginsService } from "../src/margins/margins.service.js";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";

const agreementId = "1a3c8d1e-c8ca-4551-9448-31476c575ef5";
const otherAgreementId = "6b194810-5e29-4b51-92b2-037120b1c896";
const cycleId = "2312f48d-d3c7-43c5-aed5-2cbc09a8f353";
const enrollmentId = "40f76a2a-7724-4f93-a7eb-d0d72c73520d";
const actor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "agreement_manager",
  memberships: [
    {
      agreementId,
      partyId: null,
      permissions: new Set(["margins:read", "margins:calculate"]),
    },
  ],
};

describe("margin endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const margins = { calculate: vi.fn(), getEnrollmentMargins: vi.fn() };
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
      .overrideProvider(MarginsService)
      .useValue(margins)
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

  it("requires a session before reading margin accounts", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/servants/${enrollmentId}/margins`)
      .expect(401);
  });

  it("allows the scoped manager to calculate the published competency", async () => {
    auth.authenticate.mockResolvedValue(actor);
    margins.calculate.mockResolvedValue({ payrollCycleId: cycleId, snapshotCount: 3 });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/payroll-cycles/${cycleId}/margins/calculate`)
      .set("Cookie", "mc_session=session-value")
      .expect(201);

    expect(margins.calculate).toHaveBeenCalledWith(agreementId, cycleId, expect.any(Object));
  });

  it("denies calculation in another agreement and audits it", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${otherAgreementId}/payroll-cycles/${cycleId}/margins/calculate`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(margins.calculate).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "margins:calculate" }),
    );
  });

  it("denies agreement-wide margin data to a party-scoped membership", async () => {
    auth.authenticate.mockResolvedValue({
      ...actor,
      memberships: [{ agreementId, partyId: "party-1", permissions: new Set(["margins:read"]) }],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/servants/${enrollmentId}/margins`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(margins.getEnrollmentMargins).not.toHaveBeenCalled();
  });
});
