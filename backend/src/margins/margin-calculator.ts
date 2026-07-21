export interface MarginCalculationInput {
  calculationBase: string;
  percentage: number;
  consumedAmount: string;
  reservedAmount: string;
  blockedAmount: string;
  previousAvailableAmount: string;
  eligible: boolean;
}

function toCents(value: string): bigint {
  const [units, decimals = ""] = value.split(".");
  return BigInt(units!) * 100n + BigInt(decimals.padEnd(2, "0").slice(0, 2));
}

function fromCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const text = absolute.toString().padStart(3, "0");
  return `${negative ? "-" : ""}${text.slice(0, -2)}.${text.slice(-2)}`;
}

function percentageUnits(value: number): bigint {
  return BigInt(value.toFixed(4).replace(".", ""));
}

export function calculateMargin(input: MarginCalculationInput) {
  const base = toCents(input.calculationBase);
  const percentage = percentageUnits(input.percentage);
  const calculatedTotal = input.eligible
    ? (base * percentage + 500_000n) / 1_000_000n
    : 0n;
  const consumed = toCents(input.consumedAmount);
  const reserved = toCents(input.reservedAmount);
  const blocked = toCents(input.blockedAmount);
  const committed = consumed + reserved + blocked;
  const available = calculatedTotal > committed ? calculatedTotal - committed : 0n;
  const deficit = committed > calculatedTotal ? committed - calculatedTotal : 0n;
  const previousAvailable = toCents(input.previousAvailableAmount);
  const difference = available - previousAvailable;

  return {
    calculationBase: fromCents(base),
    percentage: input.percentage.toFixed(4),
    totalAmount: fromCents(calculatedTotal),
    consumedAmount: fromCents(consumed),
    reservedAmount: fromCents(reserved),
    blockedAmount: fromCents(blocked),
    availableAmount: fromCents(available),
    deficitAmount: fromCents(deficit),
    movement: {
      direction: difference > 0n ? "INCREASE" : difference < 0n ? "DECREASE" : "NO_CHANGE",
      amount: fromCents(difference < 0n ? -difference : difference),
      balanceBefore: fromCents(previousAvailable),
      balanceAfter: fromCents(available),
    } as const,
  };
}
