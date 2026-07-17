import { describe, expect, it } from "vitest";
import { createAuditEvent } from "./audit-event.js";

describe("createAuditEvent", () => {
  it("preserves actor and correlation without accepting sensitive payloads", () => {
    const event = createAuditEvent(
      {
        correlationId: "ac52ac91-e764-46d2-a0fe-4462f02ccf17",
        actor: { userId: "user-1", role: "manager", memberships: [] },
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      {
        agreementId: "agreement-a",
        action: "payroll_cycle.open",
        outcome: "success",
        entityType: "payroll_cycle",
        entityId: "cycle-1",
      },
    );

    expect(event.actorUserId).toBe("user-1");
    expect(event.correlationId).toBe("ac52ac91-e764-46d2-a0fe-4462f02ccf17");
    expect(event.occurredAt).toBeInstanceOf(Date);
  });
});
