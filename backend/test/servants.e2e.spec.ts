import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";
import { ServantsService } from "../src/servants/servants.service.js";

const agreementId = "1a3c8d1e-c8ca-4551-9448-31476c575ef5";
const otherAgreementId = "6b194810-5e29-4b51-92b2-037120b1c896";
const actor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "agreement_manager",
  memberships: [
    {
      agreementId,
      partyId: null,
      permissions: new Set(["servants:read", "servants:write"]),
    },
  ],
};
const validInput = {
  fullName: "Maria da Silva",
  cpf: "529.982.247-25",
  birthDate: "1985-04-12",
  enrollmentNumber: "MAT-123",
  functionalStatus: "ACTIVE",
  baseSalary: "5000.00",
  mandatoryDeductions: "900.00",
  marginBase: "4100.00",
};

describe("servant endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const servants = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    lookup: vi.fn(),
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
      .overrideProvider(ServantsService)
      .useValue(servants)
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

  it("requires a session before listing servants", async () => {
    await request(app.getHttpServer()).get(`/api/v1/agreements/${agreementId}/servants`).expect(401);
    expect(servants.list).not.toHaveBeenCalled();
  });

  it("allows an agreement manager to create a validated servant", async () => {
    auth.authenticate.mockResolvedValue(actor);
    servants.create.mockResolvedValue({ id: "enrollment-1" });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/servants`)
      .set("Cookie", "mc_session=session-value")
      .send(validInput)
      .expect(201);

    expect(servants.create).toHaveBeenCalledWith(agreementId, validInput, expect.any(Object));
  });

  it("denies access to another agreement and audits the decision", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${otherAgreementId}/servants`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(servants.list).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "servants:read" }),
    );
  });

  it("rejects unknown fields before invoking the service", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/servants`)
      .set("Cookie", "mc_session=session-value")
      .send({ ...validInput, cpfPlaintextBackup: validInput.cpf })
      .expect(400);

    expect(servants.create).not.toHaveBeenCalled();
  });

  it("denies the full servant list to a party-scoped membership", async () => {
    auth.authenticate.mockResolvedValue({
      ...actor,
      memberships: [{ agreementId, partyId: "party-1", permissions: new Set(["servants:read"]) }],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/servants`)
      .set("Cookie", "mc_session=session-value")
      .expect(403);

    expect(servants.list).not.toHaveBeenCalled();
  });
});
