import { describe, expect, it } from "vitest";
import { DelimitedTextError, parseDelimitedText } from "./delimited-text.parser.js";

describe("parseDelimitedText", () => {
  it("supports BOM, CRLF, quoted delimiters and escaped quotes", () => {
    const rows = parseDelimitedText(
      Buffer.from('\uFEFFa;b\r\n1;"Saude; \"\"Norte\"\""\r\n', "utf8"),
    );

    expect(rows).toEqual([
      ["a", "b"],
      ["1", 'Saude; "Norte"'],
    ]);
  });

  it("rejects malformed quoted input", () => {
    expect(() => parseDelimitedText(Buffer.from('a;b\n1;"open'))).toThrow(DelimitedTextError);
    expect(() => parseDelimitedText(Buffer.from('a;b\n1;"ok"x'))).toThrow(DelimitedTextError);
  });
});
