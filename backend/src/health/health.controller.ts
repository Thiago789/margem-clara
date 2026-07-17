import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: this.config.get("SERVICE_NAME", { infer: true }),
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    };
  }
}
