import { describe, expect, it } from "vitest";
import { calculateMargin } from "./margin-calculator.js";

describe("calculateMargin", () => {
  it("calculates available margin after existing commitments", () => {
    expect(
      calculateMargin({
        calculationBase: "4100.00",
        percentage: 35,
        consumedAmount: "300.00",
        reservedAmount: "100.00",
        blockedAmount: "35.00",
        previousAvailableAmount: "900.00",
        eligible: true,
      }),
    ).toMatchObject({
      totalAmount: "1435.00",
      availableAmount: "1000.00",
      deficitAmount: "0.00",
      movement: { direction: "INCREASE", amount: "100.00" },
    });
  });

  it("rounds the percentage calculation to cents", () => {
    const result = calculateMargin({
      calculationBase: "100.10",
      percentage: 5,
      consumedAmount: "0.00",
      reservedAmount: "0.00",
      blockedAmount: "0.00",
      previousAvailableAmount: "0.00",
      eligible: true,
    });
    expect(result.totalAmount).toBe("5.01");
  });

  it("never exposes a negative available balance", () => {
    const result = calculateMargin({
      calculationBase: "1000.00",
      percentage: 10,
      consumedAmount: "120.00",
      reservedAmount: "10.00",
      blockedAmount: "0.00",
      previousAvailableAmount: "20.00",
      eligible: true,
    });
    expect(result.availableAmount).toBe("0.00");
    expect(result.deficitAmount).toBe("30.00");
    expect(result.movement.direction).toBe("DECREASE");
  });

  it("sets total to zero when the functional status is ineligible", () => {
    const result = calculateMargin({
      calculationBase: "4100.00",
      percentage: 35,
      consumedAmount: "0.00",
      reservedAmount: "0.00",
      blockedAmount: "0.00",
      previousAvailableAmount: "0.00",
      eligible: false,
    });
    expect(result.totalAmount).toBe("0.00");
    expect(result.availableAmount).toBe("0.00");
  });
});
