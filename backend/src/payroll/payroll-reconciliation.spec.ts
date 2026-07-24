import { describe, expect, it } from "vitest";
import { decideReconciliation } from "./payroll-reconciliation.js";

describe("payroll return reconciliation", () => {
  it("advances an integral discount", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 3, termInstallments: 12 }))
      .toEqual({ advancesInstallment: true, nextInstallment: 4, completesSchedule: false });
  });

  it("settles a fixed contract on its final integral discount", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 11, termInstallments: 12 }))
      .toEqual({ advancesInstallment: true, nextInstallment: 12, completesSchedule: true });
  });

  it("advances the schedule after a partial discount", () => {
    expect(decideReconciliation({ outcome: "PARTIAL", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 3, termInstallments: 12 }))
      .toEqual({ advancesInstallment: true, nextInstallment: 4, completesSchedule: false });
  });

  it("keeps a rejected installment available for retry", () => {
    expect(decideReconciliation({ outcome: "REJECTED", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 3, termInstallments: 12 }))
      .toEqual({ advancesInstallment: false, nextInstallment: 3, completesSchedule: false });
  });

  it("does not automatically settle an indefinite recurring product", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "INDEFINITE_RECURRING", currentInstallment: 18, termInstallments: null }))
      .toEqual({ advancesInstallment: true, nextInstallment: 19, completesSchedule: false });
  });
});
