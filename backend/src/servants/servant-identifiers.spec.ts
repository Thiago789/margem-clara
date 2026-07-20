import { describe, expect, it } from "vitest";
import {
  isValidCpf,
  maskCpf,
  maskEnrollmentNumber,
  normalizeEnrollmentNumber,
} from "./servant-identifiers.js";

describe("servant identifiers", () => {
  it("validates CPF check digits and rejects repeated digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("normalizes enrollment numbers for deterministic lookup", () => {
    expect(normalizeEnrollmentNumber(" ab-123 ")).toBe("AB-123");
  });

  it("masks identifiers while preserving minimal recognition", () => {
    expect(maskCpf("52998224725")).toBe("***.***.***-25");
    expect(maskEnrollmentNumber("AB123456")).toBe("****3456");
  });
});
