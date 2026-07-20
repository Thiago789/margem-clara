import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../../config/environment.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedActor, RequestContext } from "../request-context/request-context.js";
import { LookupHasher } from "./lookup-hasher.js";
import { PasswordHasher } from "./password-hasher.js";
import { SessionTokenService } from "./session-token.service.js";
import type { LoginCommand, LoginResult } from "./auth.types.js";

const INVALID_CREDENTIALS = "Credenciais invalidas";

@Injectable()
export class AuthService {
  private readonly sessionTtlSeconds: number;
  private readonly failureWindowSeconds: number;
  private readonly maxFailuresPerEmail: number;
  private readonly maxFailuresPerIp: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokens: SessionTokenService,
    private readonly lookupHasher: LookupHasher,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
  ) {
    this.sessionTtlSeconds = config.get("SESSION_TTL_SECONDS", { infer: true });
    this.failureWindowSeconds = config.get("AUTH_FAILURE_WINDOW_SECONDS", { infer: true });
    this.maxFailuresPerEmail = config.get("AUTH_MAX_FAILURES_PER_EMAIL", { infer: true });
    this.maxFailuresPerIp = config.get("AUTH_MAX_FAILURES_PER_IP", { infer: true });
  }

  async login(command: LoginCommand): Promise<LoginResult> {
    const email = command.email.trim().toLowerCase();
    const emailLookupHash = this.lookupHasher.hash(email);
    const ipLookupHash = this.lookupHasher.hash(command.ipAddress ?? "unknown");
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (await this.isBlocked(emailLookupHash, ipLookupHash)) {
      await this.passwordHasher.simulate(command.password);
      await this.recordDeniedAttempt(command, emailLookupHash, ipLookupHash, user?.id, "BLOCKED");
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = user
      ? await this.passwordHasher.verify(command.password, user.passwordHash)
      : await this.passwordHasher.simulate(command.password).then(() => false);

    if (!user || !passwordMatches || user.status !== "ACTIVE") {
      await this.recordDeniedAttempt(command, emailLookupHash, ipLookupHash, user?.id, "FAILURE");
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const issued = this.sessionTokens.issue();
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1_000);
    const actor = await this.loadActor(user.id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authAttempt.create({
        data: { userId: user.id, emailLookupHash, ipLookupHash, outcome: "SUCCESS" },
      });
      await transaction.authSession.create({
        data: {
          userId: user.id,
          tokenHash: issued.tokenHash,
          expiresAt,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        },
      });
      await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.id,
          actorRole: actor.role,
          action: "auth.login",
          outcome: "success",
          entityType: "auth_session",
          correlationId: command.correlationId,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        },
      });
    });

    return {
      token: issued.token,
      expiresAt,
      actor,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  async authenticate(token: string): Promise<AuthenticatedActor> {
    const now = new Date();
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.sessionTokens.hash(token) },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                role: { include: { permissions: { include: { permission: true } } } },
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Sessao invalida ou expirada");
    }

    if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60 * 1_000) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }

    return actorFromUser(session.user, now);
  }

  async logout(token: string | null, context: RequestContext): Promise<void> {
    if (!token) return;

    const tokenHash = this.sessionTokens.hash(token);
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt) return;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: session.userId,
          actorRole: context.actor?.role ?? null,
          action: "auth.logout",
          outcome: "success",
          entityType: "auth_session",
          entityId: session.id,
          correlationId: context.correlationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });
  }

  private async loadActor(userId: string): Promise<AuthenticatedActor> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    return actorFromUser(user, new Date());
  }

  private async isBlocked(emailLookupHash: string, ipLookupHash: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - this.failureWindowSeconds * 1_000);
    const lastSuccess = await this.prisma.authAttempt.findFirst({
      where: { emailLookupHash, outcome: "SUCCESS", occurredAt: { gte: windowStart } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    const emailSince = lastSuccess && lastSuccess.occurredAt > windowStart ? lastSuccess.occurredAt : windowStart;
    const [emailFailures, ipFailures] = await Promise.all([
      this.prisma.authAttempt.count({
        where: { emailLookupHash, outcome: "FAILURE", occurredAt: { gte: emailSince } },
      }),
      this.prisma.authAttempt.count({
        where: { ipLookupHash, outcome: "FAILURE", occurredAt: { gte: windowStart } },
      }),
    ]);
    return emailFailures >= this.maxFailuresPerEmail || ipFailures >= this.maxFailuresPerIp;
  }

  private async recordDeniedAttempt(
    command: LoginCommand,
    emailLookupHash: string,
    ipLookupHash: string,
    userId: string | undefined,
    outcome: "FAILURE" | "BLOCKED",
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.authAttempt.create({
        data: { ...(userId ? { userId } : {}), emailLookupHash, ipLookupHash, outcome },
      });
      await transaction.auditEvent.create({
        data: {
          action: "auth.login",
          outcome: outcome === "BLOCKED" ? "denied" : "failure",
          entityType: "auth_session",
          correlationId: command.correlationId,
          reason: outcome === "BLOCKED" ? "rate_limit" : "invalid_credentials",
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        },
      });
    });
  }
}

type UserWithMemberships = Awaited<ReturnType<PrismaService["user"]["findUniqueOrThrow"]>> & {
  memberships: Array<{
    agreementId: string | null;
    partyId: string | null;
    status: string;
    validFrom: Date;
    validUntil: Date | null;
    role: {
      code: string;
      permissions: Array<{ permission: { code: string } }>;
    };
  }>;
};

function actorFromUser(user: UserWithMemberships, now: Date): AuthenticatedActor {
  const activeMemberships = user.memberships.filter(
    (membership) =>
      membership.status === "ACTIVE" &&
      membership.validFrom <= now &&
      (!membership.validUntil || membership.validUntil > now),
  );

  return {
    userId: user.id,
    role: activeMemberships[0]?.role.code ?? "authenticated",
    memberships: activeMemberships.map((membership) => ({
      agreementId: membership.agreementId,
      partyId: membership.partyId,
      permissions: new Set(membership.role.permissions.map(({ permission }) => permission.code)),
    })),
  };
}
