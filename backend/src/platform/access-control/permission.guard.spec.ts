import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service.js";
import type { ContextualRequest } from "../request-context/request-context.js";
import { PermissionGuard } from "./permission.guard.js";

function executionContext(request: ContextualRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function requestWithActor(permissions: string[]): ContextualRequest {
  return {
    actor: {
      userId: "user-1",
      role: "agreement_manager",
      memberships: [
        {
          agreementId: "agreement-a",
          partyId: null,
          permissions: new Set(permissions),
        },
      ],
    },
    correlationId: "d1e510a4-d571-4d92-9302-b10292ed591a",
    params: { agreementId: "agreement-a" },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    get: () => undefined,
  } as unknown as ContextualRequest;
}

describe("PermissionGuard", () => {
  it("allows an authenticated actor with permission in the requested agreement", async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({
        permission: "margin:read",
        agreementParam: "agreementId",
      }),
    };
    const audit = { record: vi.fn() };
    const guard = new PermissionGuard(reflector as never, audit as unknown as AuditService);

    await expect(
      guard.canActivate(executionContext(requestWithActor(["margin:read"]))),
    ).resolves.toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("denies and audits an actor outside the required permission", async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({
        permission: "users:write",
        agreementParam: "agreementId",
      }),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const guard = new PermissionGuard(reflector as never, audit as unknown as AuditService);

    await expect(
      guard.canActivate(executionContext(requestWithActor(["margin:read"]))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: "access.denied", entityId: "users:write" }),
    );
  });

  it("does not impose authorization when an endpoint has no requirement", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const audit = { record: vi.fn() };
    const guard = new PermissionGuard(reflector as never, audit as unknown as AuditService);

    await expect(guard.canActivate(executionContext(requestWithActor([])))).resolves.toBe(true);
  });
});
