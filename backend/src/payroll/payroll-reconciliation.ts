export interface ReconciliationDecision {
  advancesInstallment: boolean;
  nextInstallment: number;
  completesSchedule: boolean;
}

export function decideReconciliation(input: {
  outcome: "FULL" | "PARTIAL" | "REJECTED";
  chargeMode: string;
  currentInstallment: number;
  termInstallments: number | null;
}): ReconciliationDecision {
  if (input.outcome === "REJECTED") {
    return {
      advancesInstallment: false,
      nextInstallment: input.currentInstallment,
      completesSchedule: false,
    };
  }
  const nextInstallment = input.currentInstallment + 1;
  const completesSchedule = input.chargeMode === "FIXED_INSTALLMENTS"
    && input.termInstallments !== null
    && nextInstallment >= input.termInstallments;
  return { advancesInstallment: true, nextInstallment, completesSchedule };
}
