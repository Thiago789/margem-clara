import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditService } from "../audit/audit.service.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../request-context/request-context.js";
import { AccessDeniedError, requireAgreementScope, requirePermission } from "./agreement-scope.js";
import {
  PERMISSION_REQUIREMENT,
  type PermissionRequirement,
} from "./require-permission.decorator.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSION_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<ContextualRequest>();
    try {
      this.authorize(request, requirement);
      return true;
    } catch (error) {
      if (!(error instanceof AccessDeniedError)) throw error;
      await this.audit.record(contextFromRequest(request), {
        agreementId: readParam(request, requirement.agreementParam),
        action: "access.denied",
        outcome: "denied",
        entityType: "permission",
        entityId: requirement.permission,
        reason: "insufficient_scope_or_permission",
      });
      throw new ForbiddenException("Acesso negado");
    }
  }

  private authorize(request: ContextualRequest, requirement: PermissionRequirement): void {
    if (!requirement.agreementParam) {
      requirePermission(request.actor ?? null, requirement.permission);
      return;
    }

    const agreementId = readParam(request, requirement.agreementParam);
    if (!agreementId) throw new AccessDeniedError();
    const partyId = readParam(request, requirement.partyParam);
    requireAgreementScope(
      request.actor ?? null,
      agreementId,
      requirement.permission,
      requirement.partyParam ? partyId ?? "" : undefined,
    );
  }
}

function readParam(request: ContextualRequest, name: string | undefined): string | null {
  if (!name) return null;
  const value = request.params[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}
