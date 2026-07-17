import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";
import { PrismaService } from "../platform/database/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: this.config.get("SERVICE_NAME", { infer: true }),
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    try {
      await this.prisma.assertReady();
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        service: this.config.get("SERVICE_NAME", { infer: true }),
        dependencies: { database: "unavailable" },
      });
    }

    return {
      status: "ready",
      service: this.config.get("SERVICE_NAME", { infer: true }),
      dependencies: { database: "ok" },
      timestamp: new Date().toISOString(),
    };
  }
}
