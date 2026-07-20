import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/platform/database/prisma.service.js";

describe("health endpoint", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/margem_clara_test";
    process.env.AUTH_LOOKUP_SECRET = "test-only-auth-lookup-secret-at-least-32-characters";
    process.env.DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    process.env.DATA_LOOKUP_SECRET = "test-only-data-lookup-secret-at-least-32-characters";
    process.env.SERVICE_NAME = "margem-clara-api-test";

    const { AppModule } = await import("../src/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns service health and a correlation id", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "margem-clara-api-test",
      version: "0.1.0",
    });
    expect(response.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("preserves a valid caller correlation id", async () => {
    const correlationId = "d1e510a4-d571-4d92-9302-b10292ed591a";
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("x-correlation-id", correlationId)
      .expect(200);

    expect(response.headers["x-correlation-id"]).toBe(correlationId);
  });

  it("reports readiness when the database responds", async () => {
    vi.spyOn(prisma, "assertReady").mockResolvedValue();

    const response = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(200);

    expect(response.body).toMatchObject({
      status: "ready",
      service: "margem-clara-api-test",
      dependencies: { database: "ok" },
    });
  });

  it("returns a safe unavailable response when the database fails", async () => {
    vi.spyOn(prisma, "assertReady").mockRejectedValue(new Error("database detail must stay private"));

    const response = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(503);

    expect(response.body).toMatchObject({
      status: "not_ready",
      service: "margem-clara-api-test",
      dependencies: { database: "unavailable" },
    });
    expect(JSON.stringify(response.body)).not.toContain("database detail must stay private");
  });
});
