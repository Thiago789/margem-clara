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
  marginGroups: [
    {
      code: "LOAN",
      name: "Emprestimo consignado",
      percentage: 35,
      sharingMode: "SEPARATE",
      productFamilies: ["PAYROLL_LOAN"],
      payrollRubricCode: "9001",
    },
    {
      code: "CARDS",
      name: "Cartoes consignados",
      percentage: 10,
      sharingMode: "SEPARATE",
      productFamilies: ["PAYROLL_CARD"],
    },
  ],
};

describe("operationalRulesSchema", () => {
  it("defaults partial discounts to the external arrears ledger", () => {
    const result = operationalRulesSchema.parse(validPolicy);

    expect(result.partialDiscountHandling).toEqual({
      defaultMode: "ARREARS_LEDGER",
      residualMaxAttempts: 1,
      residualRequiresAuthorization: true,
    });
  });

  it("requires a dedicated rubric for residual payroll collection", () => {
    const result = operationalRulesSchema.safeParse({
      ...validPolicy,
      partialDiscountHandling: {
        defaultMode: "RESIDUAL_RUBRIC",
        residualMaxAttempts: 1,
        residualRequiresAuthorization: true,
      },
    });

    expect(result.success).toBe(false);
  });

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

  it("rejects a product mapped to multiple margin groups", () => {
    const result = operationalRulesSchema.safeParse({
      ...validPolicy,
      marginGroups: [
        ...validPolicy.marginGroups,
        { ...validPolicy.marginGroups[0], code: "LOAN_2" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
