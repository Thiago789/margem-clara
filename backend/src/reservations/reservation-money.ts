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

export function normalizeMoney(value: string): string {
  return fromCents(toCents(value));
}

export function isPositiveMoney(value: string): boolean {
  return toCents(value) > 0n;
}

export function compareMoney(left: string, right: string): number {
  const difference = toCents(left) - toCents(right);
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}

export function addMoney(left: string, right: string): string {
  return fromCents(toCents(left) + toCents(right));
}

export function subtractMoney(left: string, right: string): string {
  return fromCents(toCents(left) - toCents(right));
}

export function availableMoney(
  total: string,
  consumed: string,
  reserved: string,
  blocked: string,
): string {
  const available = toCents(total) - toCents(consumed) - toCents(reserved) - toCents(blocked);
  return fromCents(available > 0n ? available : 0n);
}
