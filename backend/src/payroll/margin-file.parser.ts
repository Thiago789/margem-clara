import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { normalizeEnrollmentNumber } from "../servants/servant-identifiers.js";
import { parseDelimitedText } from "./delimited-text.parser.js";

const requiredColumns = [
  "matricula",
  "situacao_funcional",
  "remuneracao_base",
  "descontos_obrigatorios",
  "base_margem",
] as const;
const optionalColumns = [
  "tipo_vinculo",
  "grupo_folha",
  "lotacao",
  "centro_custo",
  "data_atualizacao",
] as const;
const allowedColumns = new Set<string>([...requiredColumns, ...optionalColumns]);
const codePattern = /^[A-Z][A-Z0-9_]{1,39}$/;

export interface NormalizedMarginRow {
  enrollmentNumber: string;
  functionalStatus: string;
  employmentType: string | null;
  payrollGroup: string | null;
  department: string | null;
  costCenter: string | null;
  baseSalary: string;
  mandatoryDeductions: string;
  marginBase: string;
  sourceUpdatedAt: string | null;
}

export const normalizedMarginRowSchema = z.object({
  enrollmentNumber: z.string().min(1).max(40),
  functionalStatus: z.string().regex(codePattern),
  employmentType: z.string().regex(codePattern).nullable(),
  payrollGroup: z.string().max(80).nullable(),
  department: z.string().max(160).nullable(),
  costCenter: z.string().max(80).nullable(),
  baseSalary: z.string().regex(/^\d{1,15}\.\d{2}$/),
  mandatoryDeductions: z.string().regex(/^\d{1,15}\.\d{2}$/),
  marginBase: z.string().regex(/^\d{1,15}\.\d{2}$/),
  sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
});

export interface ParsedMarginRow {
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: NormalizedMarginRow | null;
  errors: string[];
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function moneyToCanonical(value: string, field: string, errors: string[]): string {
  const text = value.trim();
  let canonical: string;
  if (text.includes(",")) {
    if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(text)) {
      errors.push(`${field}: valor monetario invalido`);
      return "0.00";
    }
    canonical = text.replace(/\./g, "").replace(",", ".");
  } else {
    if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(text)) {
      errors.push(`${field}: valor monetario invalido`);
      return "0.00";
    }
    canonical = text;
  }
  const [units, decimals = ""] = canonical.split(".");
  if (units!.length > 15) errors.push(`${field}: valor excede o limite`);
  return `${units}.${decimals.padEnd(2, "0")}`;
}

function cents(value: string): bigint {
  const [units, decimals] = value.split(".");
  return BigInt(units!) * 100n + BigInt(decimals!);
}

function optionalText(value: string | undefined, maxLength: number, field: string, errors: string[]) {
  const text = value?.trim();
  if (!text) return null;
  if (text.length > maxLength) errors.push(`${field}: excede ${maxLength} caracteres`);
  return text.slice(0, maxLength);
}

export function parseMarginFile(buffer: Buffer): ParsedMarginRow[] {
  let matrix: string[][];
  try {
    matrix = parseDelimitedText(buffer);
  } catch {
    throw new BadRequestException("Arquivo CSV invalido");
  }

  const headerRow = matrix.shift();
  if (!headerRow) throw new BadRequestException("Arquivo de margem sem cabecalho");
  const headers = headerRow.map(normalizeHeader);

  if (new Set(headers).size !== headers.length) {
    throw new BadRequestException("Cabecalho contem colunas duplicadas");
  }
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  const unknown = headers.filter((column) => !allowedColumns.has(column));
  if (missing.length || unknown.length) {
    throw new BadRequestException({
      message: "Layout de margem incompativel",
      missingColumns: missing,
      unknownColumns: unknown,
    });
  }
  if (matrix.length === 0) throw new BadRequestException("Arquivo de margem sem registros");
  if (matrix.length > 10_000) throw new BadRequestException("Arquivo excede 10000 registros");

  const records = matrix.map((values) => {
    if (values.length !== headers.length) throw new BadRequestException("Linha com quantidade de colunas invalida");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return records.map((rawData, index) => {
    const errors: string[] = [];
    const enrollmentNumber = normalizeEnrollmentNumber(rawData.matricula ?? "");
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(enrollmentNumber)) {
      errors.push("matricula: formato invalido");
    }
    const functionalStatus = (rawData.situacao_funcional ?? "").trim().toUpperCase();
    if (!codePattern.test(functionalStatus)) errors.push("situacao_funcional: formato invalido");
    const employmentType = optionalText(rawData.tipo_vinculo, 40, "tipo_vinculo", errors);
    if (employmentType && !codePattern.test(employmentType.toUpperCase())) {
      errors.push("tipo_vinculo: formato invalido");
    }
    const baseSalary = moneyToCanonical(rawData.remuneracao_base ?? "", "remuneracao_base", errors);
    const mandatoryDeductions = moneyToCanonical(
      rawData.descontos_obrigatorios ?? "",
      "descontos_obrigatorios",
      errors,
    );
    const marginBase = moneyToCanonical(rawData.base_margem ?? "", "base_margem", errors);
    if (cents(mandatoryDeductions) > cents(baseSalary)) {
      errors.push("descontos_obrigatorios: supera remuneracao_base");
    }
    if (cents(marginBase) > cents(baseSalary)) {
      errors.push("base_margem: supera remuneracao_base");
    }
    const sourceUpdatedAt = rawData.data_atualizacao?.trim() || null;
    if (sourceUpdatedAt && !z.string().datetime({ offset: true }).safeParse(sourceUpdatedAt).success) {
      errors.push("data_atualizacao: data invalida");
    }

    const normalizedData: NormalizedMarginRow = {
      enrollmentNumber,
      functionalStatus,
      employmentType: employmentType?.toUpperCase() ?? null,
      payrollGroup: optionalText(rawData.grupo_folha, 80, "grupo_folha", errors),
      department: optionalText(rawData.lotacao, 160, "lotacao", errors),
      costCenter: optionalText(rawData.centro_custo, 80, "centro_custo", errors),
      baseSalary,
      mandatoryDeductions,
      marginBase,
      sourceUpdatedAt,
    };

    return {
      rowNumber: index + 2,
      rawData,
      normalizedData: errors.length ? null : normalizedData,
      errors,
    };
  });
}
