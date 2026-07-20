import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { PasswordHasher } from "./password-hasher.js";

export interface BootstrapAdminInput {
  name: string;
  email: string;
  password: string;
}

export class BootstrapAlreadyCompletedError extends Error {
  constructor() {
    super("Initial administrator bootstrap has already been completed");
    this.name = "BootstrapAlreadyCompletedError";
  }
}

@Injectable()
export class BootstrapAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async bootstrap(input: BootstrapAdminInput): Promise<{ userId: string }> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const email = input.email.trim().toLowerCase();

    return this.prisma.$transaction(
      async (transaction) => {
        if ((await transaction.user.count()) > 0) {
          throw new BootstrapAlreadyCompletedError();
        }

        const permission = await transaction.permission.upsert({
          where: { code: "*" },
          update: { description: "Acesso integral a plataforma" },
          create: { code: "*", description: "Acesso integral a plataforma" },
        });
        const role = await transaction.role.upsert({
          where: { code: "platform_admin" },
          update: { name: "Administrador da plataforma" },
          create: {
            code: "platform_admin",
            name: "Administrador da plataforma",
            description: "Administracao inicial e operacao global controlada",
          },
        });
        await transaction.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
        const user = await transaction.user.create({
          data: { name: input.name.trim(), email, passwordHash },
        });
        await transaction.membership.create({
          data: { userId: user.id, roleId: role.id, validFrom: new Date() },
        });
        await transaction.auditEvent.create({
          data: {
            actorUserId: user.id,
            actorRole: role.code,
            action: "auth.bootstrap_admin",
            outcome: "success",
            entityType: "user",
            entityId: user.id,
            correlationId: randomUUID(),
            reason: "initial_bootstrap",
          },
        });
        return { userId: user.id };
      },
      { isolationLevel: "Serializable" },
    );
  }
}
