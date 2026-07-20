import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { RequestContext } from "../request-context/request-context.js";
import { createAuditEvent, type AuditEventInput } from "./audit-event.js";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(context: RequestContext, input: AuditEventInput): Promise<void> {
    const event = createAuditEvent(context, input);
    await this.prisma.auditEvent.create({ data: event });
  }
}
