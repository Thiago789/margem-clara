import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import type { Environment } from "../../config/environment.js";

@Injectable()
export class LookupHasher {
  private readonly secret: string;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    this.secret = config.get("AUTH_LOOKUP_SECRET", { infer: true });
  }

  hash(value: string): string {
    return createHmac("sha256", this.secret).update(value, "utf8").digest("base64url");
  }
}
