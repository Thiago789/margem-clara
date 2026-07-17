import { describe, expect, it } from "vitest";
import { AccessDeniedError, requireAgreementScope } from "./agreement-scope.js";
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
});
