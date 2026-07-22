import { describe, expect, it } from "vitest";
import { availableMoney, compareMoney, normalizeMoney } from "./reservation-money.js";

describe("reservation money", () => {
  it("normalizes values to cents without floating point arithmetic", () => {
    expect(normalizeMoney("100.1")).toBe("100.10");
    expect(compareMoney("100.10", "100.09")).toBe(1);
  });

  it("recalculates availability after a release", () => {
    expect(availableMoney("1000.00", "300.00", "200.00", "50.00")).toBe("450.00");
  });

  it("does not create artificial availability while the account has a deficit", () => {
    expect(availableMoney("100.00", "100.00", "0.00", "0.00")).toBe("0.00");
  });
});
