import { describe, expect, it } from "vitest";
import { operationalRulesSchema } from "./agreement-policy.schema.js";

const validPolicy = {
  marginConsultationAuthorization: "REQUIRED",
  reservationConfirmation: "CODE_REQUIRED",
  cutoffDay: 15,
  enabledProductFamilies: ["PAYROLL_LOAN", "PAYROLL_CARD"],
  requiredContractFields: ["CET", "FIRST_DUE_DATE"],
  publicServantValidation: {
    enabled: true,
    sourceType: "TRANSPARENCY_PORTAL",
    sourceReference: "https://transparencia.example.test",
  },
};

describe("operationalRulesSchema", () => {
  it("accepts the configurable rules decided for the first agreement version", () => {
    expect(operationalRulesSchema.safeParse(validPolicy).success).toBe(true);
  });

  it("rejects an invalid cutoff day", () => {
    expect(operationalRulesSchema.safeParse({ ...validPolicy, cutoffDay: 32 }).success).toBe(false);
  });

  it("requires source evidence when public validation is enabled", () => {
    const result = operationalRulesSchema.safeParse({
      ...validPolicy,
      publicServantValidation: { enabled: true },
    });
    expect(result.success).toBe(false);
  });
});
