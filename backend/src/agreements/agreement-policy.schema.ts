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

const marginGroup = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  name: z.string().trim().min(3).max(100),
  percentage: z.number().min(0).max(100).multipleOf(0.0001),
  sharingMode: z.enum(["SEPARATE", "SHARED"]),
  productFamilies: z.array(productFamily).min(1).max(4),
  payrollRubricCode: z.string().trim().min(1).max(40).optional(),
});

export const operationalRulesSchema = z
  .object({
    marginConsultationAuthorization: z.enum(["REQUIRED", "NOT_REQUIRED"]),
    reservationConfirmation: z.enum(["CODE_REQUIRED", "IMMEDIATE"]),
    reservationValidityMinutes: z.number().int().min(5).max(10_080).default(1_440),
    confirmationCodeValidityMinutes: z.number().int().min(3).max(30).default(10),
    confirmationMaxAttempts: z.number().int().min(3).max(10).default(5),
    cutoffDay: z.number().int().min(1).max(31),
    enabledProductFamilies: z.array(productFamily).min(1).max(4),
    eligibleFunctionalStatuses: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/))
      .min(1)
      .max(20)
      .default(["ACTIVE"]),
    requiredContractFields: z.array(contractField).max(7),
    publicServantValidation: publicValidation,
    marginGroups: z.array(marginGroup).min(1).max(8).optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.enabledProductFamilies).size !== value.enabledProductFamilies.length) {
      context.addIssue({ code: "custom", path: ["enabledProductFamilies"], message: "Produto habilitado duplicado" });
    }
    if (!value.marginGroups) return;
    const groupCodes = new Set<string>();
    const mappedFamilies = new Set<string>();
    for (const [index, group] of value.marginGroups.entries()) {
      if (groupCodes.has(group.code)) {
        context.addIssue({ code: "custom", path: ["marginGroups", index, "code"], message: "Codigo duplicado" });
      }
      groupCodes.add(group.code);
      const uniqueFamilies = new Set(group.productFamilies);
      if (uniqueFamilies.size !== group.productFamilies.length) {
        context.addIssue({ code: "custom", path: ["marginGroups", index, "productFamilies"], message: "Produto duplicado no grupo" });
      }
      if (group.sharingMode === "SEPARATE" && uniqueFamilies.size !== 1) {
        context.addIssue({ code: "custom", path: ["marginGroups", index], message: "Grupo separado deve ter um produto" });
      }
      if (group.sharingMode === "SHARED" && uniqueFamilies.size < 2) {
        context.addIssue({ code: "custom", path: ["marginGroups", index], message: "Grupo compartilhado deve ter dois produtos" });
      }
      for (const family of uniqueFamilies) {
        if (!value.enabledProductFamilies.includes(family)) {
          context.addIssue({ code: "custom", path: ["marginGroups", index, "productFamilies"], message: "Produto nao habilitado" });
        }
        if (mappedFamilies.has(family)) {
          context.addIssue({ code: "custom", path: ["marginGroups", index, "productFamilies"], message: "Produto pertence a mais de um grupo" });
        }
        mappedFamilies.add(family);
      }
    }
    for (const family of value.enabledProductFamilies) {
      if (!mappedFamilies.has(family)) {
        context.addIssue({ code: "custom", path: ["marginGroups"], message: `Produto ${family} sem grupo de margem` });
      }
    }
  });

export type OperationalRules = z.infer<typeof operationalRulesSchema>;
