import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMETERS = {
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

@Injectable()
export class PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await deriveKey(password, salt);

    return [
      "scrypt",
      "v=1",
      `n=${SCRYPT_PARAMETERS.N}`,
      `r=${SCRYPT_PARAMETERS.r}`,
      `p=${SCRYPT_PARAMETERS.p}`,
      salt.toString("base64url"),
      derivedKey.toString("base64url"),
    ].join("$");
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash);
    if (!parsed) {
      await this.simulate(password);
      return false;
    }

    const derivedKey = await deriveKey(password, parsed.salt);
    return timingSafeEqual(derivedKey, parsed.derivedKey);
  }

  async simulate(password: string): Promise<void> {
    const derivedKey = await deriveKey(password, Buffer.alloc(SALT_LENGTH));
    timingSafeEqual(derivedKey, Buffer.alloc(KEY_LENGTH));
  }
}

function parseHash(encodedHash: string): { salt: Buffer; derivedKey: Buffer } | null {
  const parts = encodedHash.split("$");
  if (
    parts.length !== 7 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "v=1" ||
    parts[2] !== `n=${SCRYPT_PARAMETERS.N}` ||
    parts[3] !== `r=${SCRYPT_PARAMETERS.r}` ||
    parts[4] !== `p=${SCRYPT_PARAMETERS.p}`
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[5] ?? "", "base64url");
    const derivedKey = Buffer.from(parts[6] ?? "", "base64url");
    if (salt.length !== SALT_LENGTH || derivedKey.length !== KEY_LENGTH) {
      return null;
    }
    return { salt, derivedKey };
  } catch {
    return null;
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, SCRYPT_PARAMETERS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}
