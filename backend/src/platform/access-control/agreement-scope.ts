import type { AuthenticatedActor, MembershipScope } from "../request-context/request-context.js";

export class AccessDeniedError extends Error {
  constructor() {
    super("Access denied");
    this.name = "AccessDeniedError";
  }
}

export interface ResolvedAgreementScope {
  agreementId: string;
  partyId: string | null;
  permissions: ReadonlySet<string>;
}

export function requirePermission(
  actor: AuthenticatedActor | null,
  permission: string,
  globalOnly = false,
): MembershipScope {
  if (!actor) throw new AccessDeniedError();

  const membership = actor.memberships.find(
    (candidate) =>
      hasPermission(candidate, permission) && (!globalOnly || candidate.agreementId === null),
  );
  if (!membership) throw new AccessDeniedError();
  return membership;
}

export function requireAgreementScope(
  actor: AuthenticatedActor | null,
  agreementId: string,
  permission: string,
  requiredPartyId?: string,
): ResolvedAgreementScope {
  if (!actor) {
    throw new AccessDeniedError();
  }

  const membership = actor.memberships.find((candidate) =>
    membershipAllows(candidate, agreementId, permission, requiredPartyId),
  );

  if (!membership) {
    throw new AccessDeniedError();
  }

  return {
    agreementId,
    partyId: membership.partyId,
    permissions: membership.permissions,
  };
}

function membershipAllows(
  membership: MembershipScope,
  agreementId: string,
  permission: string,
  requiredPartyId?: string,
): boolean {
  const agreementMatches = membership.agreementId === null || membership.agreementId === agreementId;
  if (!agreementMatches || !hasPermission(membership, permission)) {
    return false;
  }

  if (requiredPartyId === undefined) {
    return true;
  }

  return membership.partyId === null || membership.partyId === requiredPartyId;
}

function hasPermission(membership: MembershipScope, permission: string): boolean {
  return membership.permissions.has("*") || membership.permissions.has(permission);
}
