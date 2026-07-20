import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../../config/environment.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";
import type { LookupHasher } from "./lookup-hasher.js";
import type { PasswordHasher } from "./password-hasher.js";
import { SessionTokenService } from "./session-token.service.js";

const testCredential = ["long", "-test", "-password"].join("");
const command = {
  email: "GESTORA@example.test ",
  password: testCredential,
  ipAddress: "127.0.0.1",
  userAgent: "test",
  correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
};

function setup() {
  const transaction = {
    authAttempt: { create: vi.fn() },
    authSession: { create: vi.fn() },
    user: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    authAttempt: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    authSession: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
  } as unknown as PrismaService;
  const passwordHasher = {
    verify: vi.fn(),
    simulate: vi.fn().mockResolvedValue(undefined),
  };
  const lookupHasher = { hash: vi.fn((value: string) => `hash:${value}`) } as unknown as LookupHasher;
  const values: Partial<Environment> = {
    SESSION_TTL_SECONDS: 28_800,
    AUTH_FAILURE_WINDOW_SECONDS: 900,
    AUTH_MAX_FAILURES_PER_EMAIL: 5,
    AUTH_MAX_FAILURES_PER_IP: 20,
  };
  const config = { get: vi.fn((key: keyof Environment) => values[key]) };
  const service = new AuthService(
    prisma,
    passwordHasher as unknown as PasswordHasher,
    new SessionTokenService(),
    lookupHasher,
    config as never,
  );
  return { service, prisma: prisma as any, transaction, passwordHasher };
}

describe("AuthService", () => {
  it("creates a hashed session and security evidence after valid credentials", async () => {
    const { service, prisma, transaction, passwordHasher } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Gestora",
      email: "gestora@example.test",
      passwordHash: "encoded",
      status: "ACTIVE",
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      memberships: [
        {
          agreementId: "agreement-1",
          partyId: null,
          status: "ACTIVE",
          validFrom: new Date("2020-01-01"),
          validUntil: null,
          role: { code: "manager", permissions: [] },
        },
      ],
    });
    passwordHasher.verify.mockResolvedValue(true);

    const result = await service.login(command);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "gestora@example.test" } });
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", tokenHash: expect.any(String) }),
    });
    expect(transaction.authAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "SUCCESS" }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "auth.login", outcome: "success" }),
    });
    expect(result.actor.role).toBe("manager");
  });

  it("uses the same generic denial and records an unknown-user failure", async () => {
    const { service, prisma, transaction, passwordHasher } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login(command)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(passwordHasher.simulate).toHaveBeenCalledWith(command.password);
    expect(transaction.authAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "FAILURE" }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "invalid_credentials" }),
    });
  });

  it("blocks before password verification when the email threshold is reached", async () => {
    const { service, prisma, transaction, passwordHasher } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.authAttempt.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);

    await expect(service.login(command)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(passwordHasher.verify).not.toHaveBeenCalled();
    expect(passwordHasher.simulate).toHaveBeenCalled();
    expect(transaction.authAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "BLOCKED" }),
    });
  });
});
