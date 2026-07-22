import { describe, expect, it } from "vitest";
import { decideReconciliation } from "./payroll-reconciliation.js";

describe("payroll return reconciliation", () => {
  it("advances an integral discount", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 3, termInstallments: 12 }))
      .toEqual({ advancesInstallment: true, nextInstallment: 4, settlesContract: false });
  });

  it("settles a fixed contract on its final integral discount", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 11, termInstallments: 12 }))
      .toEqual({ advancesInstallment: true, nextInstallment: 12, settlesContract: true });
  });

  it.each(["PARTIAL", "REJECTED"] as const)("does not advance a %s discount", (outcome) => {
    expect(decideReconciliation({ outcome, chargeMode: "FIXED_INSTALLMENTS", currentInstallment: 3, termInstallments: 12 }))
      .toEqual({ advancesInstallment: false, nextInstallment: 3, settlesContract: false });
  });

  it("does not automatically settle an indefinite recurring product", () => {
    expect(decideReconciliation({ outcome: "FULL", chargeMode: "INDEFINITE_RECURRING", currentInstallment: 18, termInstallments: null }))
      .toEqual({ advancesInstallment: true, nextInstallment: 19, settlesContract: false });
  });
});

