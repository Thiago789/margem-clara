import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

export interface IssuedSessionToken {
  token: string;
  tokenHash: string;
}

@Injectable()
export class SessionTokenService {
  issue(): IssuedSessionToken {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("base64url");
  }
}
