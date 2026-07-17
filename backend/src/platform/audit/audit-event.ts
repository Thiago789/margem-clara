import type { RequestContext } from "../request-context/request-context.js";

export interface AuditEventInput {
  agreementId: string | null;
  action: string;
  outcome: "success" | "denied" | "failure";
  entityType: string;
  entityId?: string;
  reason?: string;
}

export interface AuditEventRecord extends AuditEventInput {
  actorUserId: string | null;
  actorRole: string | null;
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: Date;
}

export function createAuditEvent(context: RequestContext, input: AuditEventInput): AuditEventRecord {
  return {
    ...input,
    actorUserId: context.actor?.userId ?? null,
    actorRole: context.actor?.role ?? null,
    correlationId: context.correlationId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    occurredAt: new Date(),
  };
}
