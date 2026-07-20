import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgreementsService } from "../src/agreements/agreements.service.js";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";

const globalActor = {
  userId: "8d1942e9-b63f-4743-adf4-37e0e15bb498",
  role: "platform_admin",
  memberships: [{ agreementId: null, partyId: null, permissions: new Set(["*"]) }],
};

const scopedActor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "agreement_manager",
  memberships: [
    {
      agreementId: "1a3c8d1e-c8ca-4551-9448-31476c575ef5",
      partyId: null,
      permissions: new Set(["agreements:read", "agreements:write"]),
    },
  ],
};

const agreementInput = {
  organizationName: "Prefeitura Piloto",
  organizationDocumentNumber: "12345678000199",
  organizationType: "MUNICIPALITY",
  tenantKey: "prefeitura-piloto",
  code: "PILOTO",
  name: "Convenio Piloto",
  timezone: "America/Fortaleza",
};

describe("agreement endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const agreements = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    createPolicy: vi.fn(),
    activatePolicy: vi.fn(),
    activePolicy: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/margem_clara_test";
    process.env.AUTH_LOOKUP_SECRET = "test-only-auth-lookup-secret-at-least-32-characters";

    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(auth)
      .overrideProvider(AgreementsService)
      .useValue(agreements)
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

  it("requires a valid session before listing agreements", async () => {
    await request(app.getHttpServer()).get("/api/v1/agreements").expect(401);
    expect(agreements.list).not.toHaveBeenCalled();
  });

  it("allows the platform administrator to create an agreement", async () => {
    auth.authenticate.mockResolvedValue(globalActor);
    agreements.create.mockResolvedValue({ id: "agreement-1", ...agreementInput });

    await request(app.getHttpServer())
      .post("/api/v1/agreements")
      .set("Cookie", "mc_session=session-value")
      .send(agreementInput)
      .expect(201);

    expect(agreements.create).toHaveBeenCalledWith(agreementInput, expect.any(Object));
  });

  it("denies global creation to an agreement-scoped manager and audits it", async () => {
    auth.authenticate.mockResolvedValue(scopedActor);

    await request(app.getHttpServer())
      .post("/api/v1/agreements")
      .set("Cookie", "mc_session=session-value")
      .send(agreementInput)
      .expect(403);

    expect(agreements.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "agreements:write" }),
    );
  });
});
