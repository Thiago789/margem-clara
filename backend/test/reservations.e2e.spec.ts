import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/platform/audit/audit.service.js";
import { AuthService } from "../src/platform/auth/auth.service.js";
import { ReservationsService } from "../src/reservations/reservations.service.js";

const agreementId = "1a3c8d1e-c8ca-4551-9448-31476c575ef5";
const partyId = "0d9e33ea-838a-4dbd-a1d6-c78cd4b7847d";
const otherPartyId = "dad3ae65-1f79-4a60-8f02-d48e59f73ca3";
const enrollmentId = "40f76a2a-7724-4f93-a7eb-d0d72c73520d";
const accreditationId = "d714e8c0-62a9-4f1e-98c7-94de280a0e85";
const actor = {
  userId: "cc59fe16-6075-4cba-b306-5e45b7f3e66a",
  role: "consignee_operator",
  memberships: [{
    agreementId,
    partyId,
    permissions: new Set(["reservations:create", "reservations:read", "reservations:confirm"]),
  }],
};

describe("reservation endpoints", () => {
  let app: INestApplication;
  const auth = { authenticate: vi.fn(), login: vi.fn(), logout: vi.fn() };
  const reservations = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    expire: vi.fn(),
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
      .overrideProvider(ReservationsService)
      .useValue(reservations)
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

  it("requires a session before listing reservations", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/agreements/${agreementId}/parties/${partyId}/reservations`)
      .expect(401);
  });

  it("creates a reservation only inside the actor party scope", async () => {
    auth.authenticate.mockResolvedValue(actor);
    reservations.create.mockResolvedValue({ id: "reservation-1", status: "ACTIVE" });

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/parties/${partyId}/reservations`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "request-0001")
      .send({ enrollmentId, accreditationId, amount: "150.00" })
      .expect(201);

    expect(reservations.create).toHaveBeenCalledWith(
      agreementId,
      partyId,
      { enrollmentId, accreditationId, amount: "150.00" },
      "request-0001",
      expect.any(Object),
    );
  });

  it("denies use of another consignee and audits the attempt", async () => {
    auth.authenticate.mockResolvedValue(actor);

    await request(app.getHttpServer())
      .post(`/api/v1/agreements/${agreementId}/parties/${otherPartyId}/reservations`)
      .set("Cookie", "mc_session=session-value")
      .set("Idempotency-Key", "request-0002")
      .send({ enrollmentId, accreditationId, amount: "150.00" })
      .expect(403);

    expect(reservations.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "reservations:create" }),
    );
  });
});
