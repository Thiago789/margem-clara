import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../platform/database/prisma.service.js";
import type {
  AuthenticatedActor,
  RequestContext,
} from "../platform/request-context/request-context.js";
import { operationalRulesSchema } from "./agreement-policy.schema.js";
import type { CreateAgreementDto, CreateAgreementPolicyDto } from "./agreement.dto.js";

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAgreementDto, context: RequestContext) {
    return this.prisma.$transaction(
      async (transaction) => {
        let organization = await transaction.organization.findUnique({
          where: { documentNumber: input.organizationDocumentNumber },
        });
        if (organization && organization.status !== "ACTIVE") {
          throw new ConflictException("Organizacao existente nao esta ativa");
        }
        organization ??= await transaction.organization.create({
          data: {
            name: input.organizationName.trim(),
            documentNumber: input.organizationDocumentNumber,
            type: input.organizationType.trim(),
          },
        });

        const agreement = await transaction.agreement.create({
          data: {
            organizationId: organization.id,
            tenantKey: input.tenantKey.toLowerCase(),
            code: input.code.toUpperCase(),
            name: input.name.trim(),
            timezone: input.timezone,
          },
        });
        await transaction.auditEvent.create({
          data: {
            agreementId: agreement.id,
            actorUserId: context.actor?.userId ?? null,
            actorRole: context.actor?.role ?? null,
            action: "agreement.create",
            outcome: "success",
            entityType: "agreement",
            entityId: agreement.id,
            correlationId: context.correlationId,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return agreement;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async list(actor: AuthenticatedActor) {
    const globalAccess = actor.memberships.some(
      (membership) =>
        membership.agreementId === null &&
        (membership.permissions.has("*") || membership.permissions.has("agreements:read")),
    );
    const agreementIds = actor.memberships
      .filter(
        (membership) =>
          membership.agreementId &&
          (membership.permissions.has("*") || membership.permissions.has("agreements:read")),
      )
      .map((membership) => membership.agreementId!);

    return this.prisma.agreement.findMany({
      where: globalAccess ? {} : { id: { in: [...new Set(agreementIds)] } },
      include: { organization: true },
      orderBy: { name: "asc" },
      take: 100,
    });
  }

  async get(agreementId: string) {
    const agreement = await this.prisma.agreement.findUnique({
      where: { id: agreementId },
      include: { organization: true },
    });
    if (!agreement) throw new NotFoundException("Convenio nao encontrado");
    return agreement;
  }

  async createPolicy(
    agreementId: string,
    input: CreateAgreementPolicyDto,
    context: RequestContext,
  ) {
    const parsed = operationalRulesSchema.safeParse(input.payload);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
      throw new BadRequestException({ message: "Politica operacional invalida", fields });
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const agreement = await transaction.agreement.findUnique({ where: { id: agreementId } });
        if (!agreement) throw new NotFoundException("Convenio nao encontrado");
        const latest = await transaction.agreementPolicyVersion.findFirst({
          where: { agreementId, policyType: input.policyType },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const policy = await transaction.agreementPolicyVersion.create({
          data: {
            agreementId,
            policyType: input.policyType,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            payload: parsed.data,
            validFrom: new Date(),
          },
        });
        await transaction.auditEvent.create({
          data: {
            agreementId,
            actorUserId: context.actor?.userId ?? null,
            actorRole: context.actor?.role ?? null,
            action: "agreement_policy.create",
            outcome: "success",
            entityType: "agreement_policy",
            entityId: policy.id,
            correlationId: context.correlationId,
            newData: { policyType: policy.policyType, versionNumber: policy.versionNumber },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return policy;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async activatePolicy(agreementId: string, policyId: string, context: RequestContext) {
    return this.prisma.$transaction(
      async (transaction) => {
        const policy = await transaction.agreementPolicyVersion.findFirst({
          where: { id: policyId, agreementId },
        });
        if (!policy) throw new NotFoundException("Politica nao encontrada");
        if (policy.status !== "DRAFT") throw new ConflictException("A politica nao esta em rascunho");

        const now = new Date();
        await transaction.agreementPolicyVersion.updateMany({
          where: { agreementId, policyType: policy.policyType, status: "ACTIVE" },
          data: { status: "EXPIRED", validUntil: now },
        });
        const activated = await transaction.agreementPolicyVersion.update({
          where: { id: policy.id },
          data: {
            status: "ACTIVE",
            validFrom: now,
            validUntil: null,
            approvedByUserId: context.actor?.userId ?? null,
            approvedAt: now,
          },
        });
        await transaction.auditEvent.create({
          data: {
            agreementId,
            actorUserId: context.actor?.userId ?? null,
            actorRole: context.actor?.role ?? null,
            action: "agreement_policy.activate",
            outcome: "success",
            entityType: "agreement_policy",
            entityId: policy.id,
            correlationId: context.correlationId,
            newData: { policyType: policy.policyType, versionNumber: policy.versionNumber },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return activated;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async activePolicy(agreementId: string) {
    const policy = await this.prisma.agreementPolicyVersion.findFirst({
      where: { agreementId, policyType: "OPERATIONAL_RULES", status: "ACTIVE" },
      orderBy: { versionNumber: "desc" },
    });
    if (!policy) throw new NotFoundException("Politica ativa nao encontrada");
    return policy;
  }
}
