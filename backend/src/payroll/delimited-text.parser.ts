export class DelimitedTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelimitedTextError";
  }
}

export function parseDelimitedText(buffer: Buffer, delimiter = ";"): string[][] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new DelimitedTextError("Invalid UTF-8 input");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
    afterQuote = false;
  };
  const pushRow = () => {
    pushField();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    if (rows.length > 10_001) throw new DelimitedTextError("Too many rows");
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
    } else if (afterQuote) {
      if (character === delimiter) pushField();
      else if (character === "\n") pushRow();
      else if (character === "\r") {
        if (text[index + 1] === "\n") index += 1;
        pushRow();
      } else if (character !== " " && character !== "\t") {
        throw new DelimitedTextError("Unexpected character after closing quote");
      }
    } else if (character === '"') {
      if (field.trim().length !== 0) throw new DelimitedTextError("Quote inside unquoted field");
      field = "";
      quoted = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      field += character;
    }

    if (field.length > 10_000) throw new DelimitedTextError("Field exceeds size limit");
  }

  if (quoted) throw new DelimitedTextError("Unclosed quoted field");
  if (field.length > 0 || row.length > 0 || afterQuote) pushRow();
  return rows;
}
