import { describe, expect, it } from "vitest";
import { AccessDeniedError, requireAgreementScope, requirePermission } from "./agreement-scope.js";
import type { AuthenticatedActor } from "../request-context/request-context.js";

const actor: AuthenticatedActor = {
  userId: "user-1",
  role: "party_operator",
  memberships: [
    {
      agreementId: "agreement-a",
      partyId: "party-a",
      permissions: new Set(["margin:read", "reservation:create"]),
    },
  ],
};

describe("requireAgreementScope", () => {
  it("resolves an explicitly allowed agreement and party", () => {
    const scope = requireAgreementScope(actor, "agreement-a", "margin:read", "party-a");

    expect(scope.agreementId).toBe("agreement-a");
    expect(scope.partyId).toBe("party-a");
  });

  it("denies access to another agreement", () => {
    expect(() => requireAgreementScope(actor, "agreement-b", "margin:read")).toThrow(AccessDeniedError);
  });

  it("denies access to another party in the same agreement", () => {
    expect(() => requireAgreementScope(actor, "agreement-a", "margin:read", "party-b")).toThrow(
      AccessDeniedError,
    );
  });

  it("denies a permission that was not granted", () => {
    expect(() => requireAgreementScope(actor, "agreement-a", "audit:read")).toThrow(AccessDeniedError);
  });

  it("allows a global wildcard membership across agreements and parties", () => {
    const platformAdmin: AuthenticatedActor = {
      userId: "admin-1",
      role: "platform_admin",
      memberships: [{ agreementId: null, partyId: null, permissions: new Set(["*"]) }],
    };

    expect(requireAgreementScope(platformAdmin, "agreement-b", "audit:read", "party-b")).toMatchObject({
      agreementId: "agreement-b",
      partyId: null,
    });
  });

  it("allows an agreement manager to reach any party only inside its agreement", () => {
    const manager: AuthenticatedActor = {
      userId: "manager-1",
      role: "agreement_manager",
      memberships: [
        { agreementId: "agreement-a", partyId: null, permissions: new Set(["accreditation:write"]) },
      ],
    };

    expect(() =>
      requireAgreementScope(manager, "agreement-a", "accreditation:write", "party-b"),
    ).not.toThrow();
    expect(() => requireAgreementScope(manager, "agreement-b", "accreditation:write")).toThrow(
      AccessDeniedError,
    );
  });

  it("checks global permissions without requiring an agreement", () => {
    expect(requirePermission(actor, "margin:read")).toBe(actor.memberships[0]);
    expect(() => requirePermission(actor, "users:write")).toThrow(AccessDeniedError);
  });

  it("does not treat an agreement membership as a global platform grant", () => {
    expect(() => requirePermission(actor, "margin:read", true)).toThrow(AccessDeniedError);
  });
});
