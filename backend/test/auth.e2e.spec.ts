import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/platform/auth/auth.service.js";

const actor = {
  userId: "8d1942e9-b63f-4743-adf4-37e0e15bb498",
  role: "manager",
  memberships: [
    {
      agreementId: "1a3c8d1e-c8ca-4551-9448-31476c575ef5",
      partyId: null,
      permissions: new Set(["margin:read"]),
    },
  ],
};
const testCredential = ["long", "-test", "-password"].join("");
const sessionValue = ["opaque", "-session", "-value"].join("");

describe("auth endpoints", () => {
  let app: INestApplication;
  const authService = {
    login: vi.fn(),
    authenticate: vi.fn(),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/margem_clara_test";
    process.env.AUTH_LOOKUP_SECRET = "test-only-auth-lookup-secret-at-least-32-characters";
    process.env.DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    process.env.DATA_LOOKUP_SECRET = "test-only-data-lookup-secret-at-least-32-characters";

    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue(authService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it("issues an HttpOnly session cookie without exposing the token in JSON", async () => {
    authService.login.mockResolvedValue({
      token: sessionValue,
      expiresAt: new Date("2026-07-20T18:00:00.000Z"),
      actor,
      user: { id: actor.userId, name: "Gestora Piloto", email: "gestora@example.test" },
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "gestora@example.test", password: testCredential })
      .expect(200);

    const cookie = response.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain(`mc_session=${sessionValue}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1");
    expect(JSON.stringify(response.body)).not.toContain(sessionValue);
  });

  it("rejects protected access without a session", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it("resolves the authenticated actor from the opaque cookie", async () => {
    authService.authenticate.mockResolvedValue(actor);

    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", "mc_session=opaque-session-token")
      .expect(200);

    expect(authService.authenticate).toHaveBeenCalledWith("opaque-session-token");
    expect(response.body.memberships[0].permissions).toEqual(["margin:read"]);
  });

  it("revokes the session and clears the cookie on logout", async () => {
    authService.logout.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", "mc_session=opaque-session-token")
      .expect(204);

    expect(authService.logout).toHaveBeenCalledWith("opaque-session-token", expect.any(Object));
    expect(response.headers["set-cookie"]?.[0] ?? "").toContain("mc_session=");
  });
});
