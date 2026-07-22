import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { parseDelimitedText } from "./delimited-text.parser.js";

export const insertionHeader = [
  "consignataria_documento",
  "matricula",
  "contrato",
  "rubrica",
  "valor",
  "competencia",
  "parcela",
  "total_parcelas",
  "tipo_operacao",
  "produto",
] as const;

const returnHeader = [
  "consignataria_documento",
  "contrato",
  "competencia",
  "parcela",
  "valor_previsto",
  "valor_descontado",
  "status",
  "motivo",
] as const;

const moneyPattern = /^\d{1,15}\.\d{2}$/;

export const normalizedReturnRowSchema = z.object({
  partyDocument: z.string().min(1).max(30),
  contractNumber: z.string().min(1).max(80),
  competency: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  installmentNumber: z.number().int().positive().nullable(),
  expectedAmount: z.string().regex(moneyPattern),
  discountedAmount: z.string().regex(moneyPattern),
  outcome: z.enum(["FULL", "PARTIAL", "REJECTED"]),
  reason: z.string().max(200).nullable(),
});

export type NormalizedReturnRow = z.infer<typeof normalizedReturnRowSchema>;

export interface ParsedReturnRow {
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: NormalizedReturnRow | null;
  errors: string[];
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildInsertionCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null>>): Buffer {
  const lines = [insertionHeader, ...rows].map((row) => row.map(csvCell).join(";"));
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

function canonicalMoney(value: string, field: string, errors: string[]): string {
  const text = value.trim();
  let canonical = text;
  if (text.includes(",")) {
    if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(text)) {
      errors.push(`${field}: valor monetario invalido`);
      return "0.00";
    }
    canonical = text.replace(/\./g, "").replace(",", ".");
  } else if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(text)) {
    errors.push(`${field}: valor monetario invalido`);
    return "0.00";
  }
  const [units, decimals = ""] = canonical.split(".");
  return `${units}.${decimals.padEnd(2, "0")}`;
}

function cents(value: string): bigint {
  const [units, decimals] = value.split(".");
  return BigInt(units!) * 100n + BigInt(decimals!);
}

export function parseReturnFile(buffer: Buffer): ParsedReturnRow[] {
  let matrix: string[][];
  try {
    matrix = parseDelimitedText(buffer);
  } catch {
    throw new BadRequestException("Arquivo CSV invalido");
  }
  const headers = matrix.shift()?.map((value) => value.trim().toLowerCase());
  if (!headers || headers.length !== returnHeader.length || headers.some((value, index) => value !== returnHeader[index])) {
    throw new BadRequestException({ message: "Layout de retorno incompativel", expectedColumns: returnHeader });
  }
  if (matrix.length === 0) throw new BadRequestException("Arquivo de retorno sem registros");
  if (matrix.length > 10_000) throw new BadRequestException("Arquivo excede 10000 registros");

  return matrix.map((values, index) => {
    if (values.length !== headers.length) throw new BadRequestException("Linha com quantidade de colunas invalida");
    const rawData = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const errors: string[] = [];
    const partyDocument = (rawData.consignataria_documento ?? "").replace(/\D/g, "");
    if (!/^\d{11,14}$/.test(partyDocument)) errors.push("consignataria_documento: formato invalido");
    const contractNumber = (rawData.contrato ?? "").trim();
    if (!contractNumber || contractNumber.length > 80) errors.push("contrato: formato invalido");
    const competency = (rawData.competencia ?? "").trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(competency)) errors.push("competencia: formato invalido");
    const installmentText = (rawData.parcela ?? "").trim();
    const installmentNumber = installmentText ? Number(installmentText) : null;
    if (installmentNumber !== null && (!Number.isInteger(installmentNumber) || installmentNumber < 1)) errors.push("parcela: formato invalido");
    const expectedAmount = canonicalMoney(rawData.valor_previsto ?? "", "valor_previsto", errors);
    const discountedAmount = canonicalMoney(rawData.valor_descontado ?? "", "valor_descontado", errors);
    const outcome = (rawData.status ?? "").trim().toUpperCase();
    if (!(outcome === "FULL" || outcome === "PARTIAL" || outcome === "REJECTED")) errors.push("status: valor invalido");
    const reason = (rawData.motivo ?? "").trim() || null;
    if (reason && reason.length > 200) errors.push("motivo: excede 200 caracteres");
    if (outcome === "FULL" && cents(discountedAmount) !== cents(expectedAmount)) errors.push("valor_descontado: desconto integral deve ser igual ao previsto");
    if (outcome === "PARTIAL" && !(cents(discountedAmount) > 0n && cents(discountedAmount) < cents(expectedAmount))) errors.push("valor_descontado: desconto parcial deve ser maior que zero e menor que o previsto");
    if (outcome === "REJECTED" && cents(discountedAmount) !== 0n) errors.push("valor_descontado: rejeicao deve ter valor zero");
    if (outcome !== "FULL" && !reason) errors.push("motivo: obrigatorio para desconto parcial ou rejeitado");

    const candidate = { partyDocument, contractNumber, competency, installmentNumber, expectedAmount, discountedAmount, outcome, reason };
    const parsed = normalizedReturnRowSchema.safeParse(candidate);
    if (!parsed.success && errors.length === 0) errors.push("linha: dados invalidos");
    return { rowNumber: index + 2, rawData, normalizedData: errors.length ? null : parsed.data!, errors };
  });
}

