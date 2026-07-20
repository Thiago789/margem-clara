import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { z } from "zod";
import { AppModule } from "../app.module.js";
import {
  BootstrapAdminService,
  BootstrapAlreadyCompletedError,
} from "../platform/auth/bootstrap-admin.service.js";

const inputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(16).max(256),
});

async function main(): Promise<void> {
  const parsed = inputSchema.safeParse({
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error("Defina nome, e-mail valido e senha de pelo menos 16 caracteres para o bootstrap");
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    await app.get(BootstrapAdminService).bootstrap(parsed.data);
    Logger.log("Administrador inicial criado com sucesso", "BootstrapAdmin");
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof BootstrapAlreadyCompletedError
      ? "Bootstrap recusado: ja existe usuario cadastrado"
      : error instanceof Error
        ? error.message
        : "Falha desconhecida no bootstrap";
  Logger.error(message, undefined, "BootstrapAdmin");
  process.exitCode = 1;
});
