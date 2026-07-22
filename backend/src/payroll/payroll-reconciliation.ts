export interface ReconciliationDecision {
  advancesInstallment: boolean;
  nextInstallment: number;
  settlesContract: boolean;
}

export function decideReconciliation(input: {
  outcome: "FULL" | "PARTIAL" | "REJECTED";
  chargeMode: string;
  currentInstallment: number;
  termInstallments: number | null;
}): ReconciliationDecision {
  if (input.outcome !== "FULL") {
    return {
      advancesInstallment: false,
      nextInstallment: input.currentInstallment,
      settlesContract: false,
    };
  }
  const nextInstallment = input.currentInstallment + 1;
  const settlesContract = input.chargeMode === "FIXED_INSTALLMENTS"
    && input.termInstallments !== null
    && nextInstallment >= input.termInstallments;
  return { advancesInstallment: true, nextInstallment, settlesContract };
}

