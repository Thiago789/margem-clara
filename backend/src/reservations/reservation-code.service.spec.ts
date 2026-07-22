import { describe, expect, it, vi } from "vitest";
import type { DataProtectionService } from "../platform/crypto/data-protection.service.js";
import { ReservationCodeService } from "./reservation-code.service.js";

describe("ReservationCodeService", () => {
  const protection = {
    lookupHash: vi.fn((value: string, purpose: string) => `hash:${purpose}:${value}`),
    encrypt: vi.fn((value: string, purpose: string) => `encrypted:${purpose}:${value}`),
  } as unknown as DataProtectionService;
  const service = new ReservationCodeService(protection);

  it("issues a six digit code but stores only protected representations", () => {
    const issued = service.issue("reservation-1");

    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.hash).not.toBe(issued.code);
    expect(issued.protectedCode).not.toBe(issued.code);
  });

  it("verifies a code bound to its reservation", () => {
    const expected = "hash:reservation.confirmation_code:reservation-1:123456";

    expect(service.verify("reservation-1", "123456", expected)).toBe(true);
    expect(service.verify("reservation-2", "123456", expected)).toBe(false);
  });
});
