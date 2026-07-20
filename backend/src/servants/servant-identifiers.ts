export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function normalizeEnrollmentNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskCpf(cpf: string): string {
  return `***.***.***-${cpf.slice(-2)}`;
}

export function maskEnrollmentNumber(value: string): string {
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(4, value.length - visible.length))}${visible}`;
}
