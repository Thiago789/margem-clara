import { z } from "zod";

const productFamily = z.enum([
  "PAYROLL_LOAN",
  "PAYROLL_CARD",
  "BENEFIT_CARD",
  "OPTIONAL_DEDUCTION",
]);

const contractField = z.enum([
  "CET",
  "FIRST_DUE_DATE",
  "CONTRACT_VALUE",
  "FIRST_COMPETENCY",
  "ORIGIN_CONTRACT",
  "ORIGIN_CREDITOR",
  "DEBT_PURCHASE_VALUE",
]);

const publicValidation = z
  .object({
    enabled: z.boolean(),
    sourceType: z.enum(["TRANSPARENCY_PORTAL", "API", "OFFICIAL_FILE"]).optional(),
    sourceReference: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.enabled && (!value.sourceType || !value.sourceReference)) {
      context.addIssue({
        code: "custom",
        message: "Fonte e referencia sao obrigatorias quando a validacao publica esta ativa",
      });
    }
  });

export const operationalRulesSchema = z.object({
  marginConsultationAuthorization: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  reservationConfirmation: z.enum(["CODE_REQUIRED", "IMMEDIATE"]),
  cutoffDay: z.number().int().min(1).max(31),
  enabledProductFamilies: z.array(productFamily).min(1).max(4),
  requiredContractFields: z.array(contractField).max(7),
  publicServantValidation: publicValidation,
});

export type OperationalRules = z.infer<typeof operationalRulesSchema>;
