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
  if (membership.agreementId !== agreementId || !membership.permissions.has(permission)) {
    return false;
  }

  if (requiredPartyId === undefined) {
    return true;
  }

  return membership.partyId === requiredPartyId;
}
