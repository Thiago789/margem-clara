import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { BootstrapAdminService, BootstrapAlreadyCompletedError } from "./bootstrap-admin.service.js";
import type { PasswordHasher } from "./password-hasher.js";

function setup(existingUsers = 0) {
  const transaction = {
    user: {
      count: vi.fn().mockResolvedValue(existingUsers),
      create: vi.fn().mockResolvedValue({ id: "user-1" }),
    },
    permission: {
      upsert: vi.fn().mockResolvedValue({ id: "permission-1", code: "*" }),
    },
    role: {
      upsert: vi.fn().mockResolvedValue({ id: "role-1", code: "platform_admin" }),
    },
    rolePermission: { upsert: vi.fn() },
    membership: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    ),
  } as unknown as PrismaService;
  const passwordHasher = { hash: vi.fn().mockResolvedValue("encoded-password-hash") };
  const service = new BootstrapAdminService(
    prisma,
    passwordHasher as unknown as PasswordHasher,
  );
  return { service, prisma: prisma as any, transaction, passwordHasher };
}

describe("BootstrapAdminService", () => {
  it("creates the first user with a global wildcard membership and audit evidence", async () => {
    const { service, prisma, transaction } = setup();

    await expect(
      service.bootstrap({ name: "Admin Piloto", email: "ADMIN@example.test ", password: "test-value" }),
    ).resolves.toEqual({ userId: "user-1" });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "admin@example.test", passwordHash: "encoded-password-hash" }),
    });
    expect(transaction.rolePermission.upsert).toHaveBeenCalled();
    expect(transaction.membership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", roleId: "role-1" }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "auth.bootstrap_admin", actorUserId: "user-1" }),
    });
  });

  it("refuses to create another administrator after any user exists", async () => {
    const { service, transaction } = setup(1);

    await expect(
      service.bootstrap({ name: "Outro Admin", email: "outro@example.test", password: "test-value" }),
    ).rejects.toBeInstanceOf(BootstrapAlreadyCompletedError);
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(transaction.membership.create).not.toHaveBeenCalled();
  });
});
