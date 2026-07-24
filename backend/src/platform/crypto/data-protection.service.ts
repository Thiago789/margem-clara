import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { Environment } from "../../config/environment.js";

export type DataProtectionPurpose =
  | "person.cpf"
  | "person.email"
  | "person.phone"
  | "enrollment.number"
  | "payroll.margin_row"
  | "payroll.insertion_row"
  | "payroll.return_row"
  | "payroll.exception_note"
  | "payroll.exception_resolution_note"
  | "contract.arrears_reversal_reason"
  | "reservation.confirmation_code";

export class InvalidProtectedValueError extends Error {
  constructor() {
    super("Protected value is invalid");
    this.name = "InvalidProtectedValueError";
  }
}

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid encoding");
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Non-canonical encoding");
  }

  return decoded;
}

@Injectable()
export class DataProtectionService {
  private readonly encryptionKey: Buffer;
  private readonly lookupSecret: string;

  constructor(config: ConfigService<Environment, true>) {
    this.encryptionKey = Buffer.from(config.getOrThrow<string>("DATA_ENCRYPTION_KEY"), "base64url");
    this.lookupSecret = config.getOrThrow<string>("DATA_LOOKUP_SECRET");
  }

  encrypt(plaintext: string, purpose: DataProtectionPurpose): string {
    if (plaintext.length === 0) {
      throw new TypeError("Cannot protect an empty value");
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
  }

  decrypt(protectedValue: string, purpose: DataProtectionPurpose): string {
    try {
      const [version, ivText, ciphertextText, tagText, extra] = protectedValue.split(".");
      if (version !== VERSION || !ivText || !ciphertextText || !tagText || extra !== undefined) {
        throw new Error("Invalid envelope");
      }

      const iv = decodeBase64Url(ivText);
      const ciphertext = decodeBase64Url(ciphertextText);
      const tag = decodeBase64Url(tagText);
      if (iv.length !== IV_BYTES || ciphertext.length === 0 || tag.length !== TAG_BYTES) {
        throw new Error("Invalid envelope size");
      }

      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new InvalidProtectedValueError();
    }
  }

  lookupHash(normalizedValue: string, purpose: DataProtectionPurpose): string {
    if (normalizedValue.length === 0) {
      throw new TypeError("Cannot index an empty value");
    }

    return createHmac("sha256", this.lookupSecret)
      .update(`${VERSION}:${purpose}\0${normalizedValue}`, "utf8")
      .digest("base64url");
  }
}
