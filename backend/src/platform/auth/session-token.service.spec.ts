import { describe, expect, it } from "vitest";
import { SessionTokenService } from "./session-token.service.js";

describe("SessionTokenService", () => {
  const service = new SessionTokenService();

  it("issues opaque tokens and stores only a deterministic hash", () => {
    const first = service.issue();
    const second = service.issue();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(service.hash(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.token.length).toBeGreaterThanOrEqual(40);
  });
});
