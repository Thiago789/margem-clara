import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { parseMarginFile } from "./margin-file.parser.js";

const header =
  "matricula;situacao_funcional;remuneracao_base;descontos_obrigatorios;base_margem;tipo_vinculo";

describe("parseMarginFile", () => {
  it("parses the version-one semicolon layout and Brazilian money", () => {
    const [row] = parseMarginFile(
      Buffer.from(`${header}\nMAT-123;ACTIVE;5.000,00;900,00;4.100,00;EFFECTIVE`),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      errors: [],
      normalizedData: {
        enrollmentNumber: "MAT-123",
        baseSalary: "5000.00",
        mandatoryDeductions: "900.00",
        marginBase: "4100.00",
      },
    });
  });

  it("keeps invalid rows for review instead of silently accepting them", () => {
    const [row] = parseMarginFile(Buffer.from(`${header}\n?;ACTIVE;1000,00;1200,00;900,00;EFFECTIVE`));

    expect(row?.normalizedData).toBeNull();
    expect(row?.errors).toContain("matricula: formato invalido");
    expect(row?.errors).toContain("descontos_obrigatorios: supera remuneracao_base");
  });

  it("rejects incompatible headers", () => {
    expect(() => parseMarginFile(Buffer.from("matricula;salario\n1;100"))).toThrow(
      BadRequestException,
    );
  });

  it("supports quoted delimiters through the CSV parser", () => {
    const extendedHeader = `${header};lotacao`;
    const [row] = parseMarginFile(
      Buffer.from(`${extendedHeader}\nMAT-123;ACTIVE;1000,00;100,00;900,00;EFFECTIVE;"Saude; Norte"`),
    );

    expect(row?.normalizedData?.department).toBe("Saude; Norte");
  });
});
