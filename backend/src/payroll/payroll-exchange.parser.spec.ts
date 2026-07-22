import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { buildInsertionCsv, parseReturnFile } from "./payroll-exchange.parser.js";

describe("payroll exchange layouts", () => {
  it("generates the insertion layout with stable columns and escaped values", () => {
    const csv = buildInsertionCsv([
      ["12345678000199", "MAT-1", 'CTR;"7', "9001", "200.00", "2026-07", 1, 60, "NEW", "LOAN"],
    ]).toString("utf8");

    expect(csv).toContain("consignataria_documento;matricula;contrato;rubrica;valor");
    expect(csv).toContain('"CTR;""7"');
    expect(csv).toContain(";2026-07;1;60;NEW;LOAN");
  });

  it("accepts integral, partial and rejected payroll outcomes", () => {
    const header = "consignataria_documento;contrato;competencia;parcela;valor_previsto;valor_descontado;status;motivo";
    const csv = Buffer.from([
      header,
      "12345678000199;CTR-1;2026-07;1;200,00;200,00;FULL;",
      "12345678000199;CTR-2;2026-07;2;200,00;80,00;PARTIAL;Margem insuficiente",
      "12345678000199;CTR-3;2026-07;3;200,00;0,00;REJECTED;Afastamento",
    ].join("\n"));

    const rows = parseReturnFile(csv);

    expect(rows.map((row) => row.normalizedData?.outcome)).toEqual(["FULL", "PARTIAL", "REJECTED"]);
    expect(rows[1]?.normalizedData?.discountedAmount).toBe("80.00");
    expect(rows.every((row) => row.errors.length === 0)).toBe(true);
  });

  it("rejects incoherent values and a return without a reason", () => {
    const csv = Buffer.from([
      "consignataria_documento;contrato;competencia;parcela;valor_previsto;valor_descontado;status;motivo",
      "12345678000199;CTR-1;2026-07;1;200.00;200.00;PARTIAL;",
    ].join("\n"));

    const [row] = parseReturnFile(csv);

    expect(row?.normalizedData).toBeNull();
    expect(row?.errors).toEqual(expect.arrayContaining([
      "valor_descontado: desconto parcial deve ser maior que zero e menor que o previsto",
      "motivo: obrigatorio para desconto parcial ou rejeitado",
    ]));
  });

  it("rejects a reordered or unknown return layout", () => {
    expect(() => parseReturnFile(Buffer.from("contrato;competencia\nCTR-1;2026-07"))).toThrow(BadRequestException);
  });
});

