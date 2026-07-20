import { randomUUID } from "node:crypto";
import type { Request } from "express";

export interface MembershipScope {
  agreementId: string | null;
  partyId: string | null;
  permissions: ReadonlySet<string>;
}

export interface AuthenticatedActor {
  userId: string;
  role: string;
  memberships: readonly MembershipScope[];
}

export interface RequestContext {
  correlationId: string;
  actor: AuthenticatedActor | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ContextualRequest extends Request {
  correlationId: string;
  actor?: AuthenticatedActor;
}

export function contextFromRequest(request: ContextualRequest): RequestContext {
  return {
    correlationId: request.correlationId,
    actor: request.actor ?? null,
    ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
    userAgent: request.get("user-agent") ?? null,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
}
