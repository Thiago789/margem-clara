import { describe, expect, it } from "vitest";
import { PasswordHasher } from "./password-hasher.js";

describe("PasswordHasher", () => {
  const hasher = new PasswordHasher();

  it("verifies the correct password and rejects a different password", async () => {
    const encoded = await hasher.hash("a-long-test-password");

    await expect(hasher.verify("a-long-test-password", encoded)).resolves.toBe(true);
    await expect(hasher.verify("another-test-password", encoded)).resolves.toBe(false);
  });

  it("uses a different random salt for each hash", async () => {
    const first = await hasher.hash("a-long-test-password");
    const second = await hasher.hash("a-long-test-password");

    expect(first).not.toBe(second);
  });

  it("rejects malformed or unsupported hashes", async () => {
    await expect(hasher.verify("a-long-test-password", "not-a-valid-hash")).resolves.toBe(false);
  });
});
