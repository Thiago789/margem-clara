import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { Environment } from "../../config/environment.js";
import { DataProtectionService, InvalidProtectedValueError } from "./data-protection.service.js";

const config = new ConfigService<Environment, true>({
  DATA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  DATA_LOOKUP_SECRET: "test-only-data-lookup-secret-at-least-32-characters",
} as Environment);

describe("DataProtectionService", () => {
  const service = new DataProtectionService(config);

  it("encrypts and decrypts a value for its declared purpose", () => {
    const protectedValue = service.encrypt("12345678901", "person.cpf");

    expect(protectedValue).not.toContain("12345678901");
    expect(service.decrypt(protectedValue, "person.cpf")).toBe("12345678901");
  });

  it("uses a fresh initialization vector for every encryption", () => {
    const first = service.encrypt("12345678901", "person.cpf");
    const second = service.encrypt("12345678901", "person.cpf");

    expect(first).not.toBe(second);
  });

  it("rejects tampering and use under another purpose", () => {
    const protectedValue = service.encrypt("12345678901", "person.cpf");
    const tampered = `${protectedValue.slice(0, -1)}${protectedValue.endsWith("A") ? "B" : "A"}`;

    expect(() => service.decrypt(tampered, "person.cpf")).toThrow(InvalidProtectedValueError);
    expect(() => service.decrypt(protectedValue, "enrollment.number")).toThrow(InvalidProtectedValueError);
  });

  it("builds deterministic, purpose-bound lookup hashes", () => {
    const first = service.lookupHash("12345678901", "person.cpf");

    expect(service.lookupHash("12345678901", "person.cpf")).toBe(first);
    expect(service.lookupHash("12345678901", "enrollment.number")).not.toBe(first);
    expect(first).not.toContain("12345678901");
  });
});
