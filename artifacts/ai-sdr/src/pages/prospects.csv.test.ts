import { describe, it, expect } from "vitest";
import { analyzeCSV, analyzeCSVBuffer } from "./prospects";

// Narrow the CSVAnalysis union to the success shape so tests can read records/
// skippedRows/headers without repeating the `ok` guard everywhere.
function expectOk(result: ReturnType<typeof analyzeCSV>) {
  if (!result.ok) {
    throw new Error(`Expected analyzeCSV to succeed but it failed: ${result.error}`);
  }
  return result;
}

const HEADER = "Company Name,Contact Name,Email Address";

// Encode a string as UTF-16LE bytes (optionally with a BOM) — Node/browser
// TextEncoder only supports UTF-8, so build the buffer by hand.
function encodeUTF16LE(text: string, { bom }: { bom: boolean }): ArrayBuffer {
  const codeUnits: number[] = bom ? [0xfeff] : [];
  for (let i = 0; i < text.length; i++) codeUnits.push(text.charCodeAt(i));
  const bytes = new Uint8Array(codeUnits.length * 2);
  codeUnits.forEach((u, i) => {
    bytes[i * 2] = u & 0xff;
    bytes[i * 2 + 1] = u >> 8;
  });
  return bytes.buffer;
}

describe("analyzeCSV", () => {
  it("skips a leading disclaimer line and still picks the real header", () => {
    // A one-cell disclaimer line above the header — ZoomInfo/Apollo exports
    // commonly prepend these. It must not be mistaken for the header row.
    const csv = [
      "Confidential — internal use only",
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com",
    ].join("\n");

    const result = expectOk(analyzeCSV(csv));

    expect(result.headers).toEqual(["Company Name", "Contact Name", "Email Address"]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      "Company Name": "Acme Corp",
      "Contact Name": "Jane Doe",
      "Email Address": "jane@acme.com",
    });
    expect(result.skippedRows).toHaveLength(0);
    expect(result.malformed).toBe(0);
  });

  it("quietly ignores a trailing summary line instead of flagging it as a skip", () => {
    // "Total: 500" is a single-cell noise line that should be dropped silently,
    // not surfaced as a recoverable skipped row.
    const csv = [
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com",
      "Total: 2 records",
    ].join("\n");

    const result = expectOk(analyzeCSV(csv));

    expect(result.records).toHaveLength(2);
    expect(result.skippedRows).toHaveLength(0);
    expect(result.malformed).toBe(0);
  });

  it("still surfaces a genuine data row with the wrong column count as a skip", () => {
    // This row has real data spanning multiple cells but one column too many, so
    // it would be mangled into the wrong fields. It must be flagged (not dropped
    // as noise, and not imported as-is).
    const csv = [
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com,extra-column-value",
    ].join("\n");

    const result = expectOk(analyzeCSV(csv));

    expect(result.records).toHaveLength(1);
    expect(result.records[0]["Company Name"]).toBe("Acme Corp");
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0]).toEqual([
      "Globex Inc",
      "John Roe",
      "john@globex.com",
      "extra-column-value",
    ]);
    expect(result.malformed).toBe(1);
  });

  it("produces no false skips for a clean file", () => {
    const csv = [
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com",
      "Initech,Bill Lumbergh,bill@initech.com",
    ].join("\n");

    const result = expectOk(analyzeCSV(csv));

    expect(result.headers).toEqual(["Company Name", "Contact Name", "Email Address"]);
    expect(result.records).toHaveLength(3);
    expect(result.skippedRows).toHaveLength(0);
    expect(result.malformed).toBe(0);
  });

  it("handles a disclaimer + trailing summary + a real malformed row together", () => {
    // The combined case: noise above and below the table plus one genuinely
    // broken row. Only the broken row should be skipped; the summary is dropped.
    const csv = [
      "Export generated on 2026-07-12",
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe", // one column short — genuine malformed row
      "Initech,Bill Lumbergh,bill@initech.com",
      "Total: 3 records",
    ].join("\n");

    const result = expectOk(analyzeCSV(csv));

    expect(result.headers).toEqual(["Company Name", "Contact Name", "Email Address"]);
    expect(result.records).toHaveLength(2);
    expect(result.skippedRows).toEqual([["Globex Inc", "John Roe"]]);
    expect(result.malformed).toBe(1);
  });
});

describe("analyzeCSV – non-CSV file rejection", () => {
  it("rejects an .xlsx / zip file (PK signature) with Save-As guidance", () => {
    // Simulate the PK\x03\x04 magic bytes that open every .xlsx/zip file.
    const xlsxContent = "PK\x03\x04somebinarydata";
    const result = analyzeCSV(xlsxContent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/xlsx/i);
      expect(result.error).toMatch(/save as/i);
    }
  });

  it("rejects a legacy .xls file (D0 CF signature) with Save-As guidance", () => {
    // Legacy Excel files start with the OLE2 compound-file magic bytes D0 CF.
    const xlsContent = "\xD0\xCF\x11\xE0somebinarydata";
    const result = analyzeCSV(xlsContent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\.xls\b/i);
      expect(result.error).toMatch(/save as/i);
    }
  });

  it("rejects a PDF file (%PDF signature) with re-export guidance", () => {
    const pdfContent = "%PDF-1.4 fake pdf content here";
    const result = analyzeCSV(pdfContent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/pdf/i);
      expect(result.error).toMatch(/csv/i);
    }
  });

  it("rejects a file containing null bytes (binary payload)", () => {
    // Null bytes (\u0000) are never valid in a text CSV.
    const binaryContent = "Company Name,Contact Name\u0000\u0000\u0000garbage binary data";
    const result = analyzeCSV(binaryContent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/binary/i);
      expect(result.error).toMatch(/csv/i);
    }
  });

  it("rejects a file dominated by Unicode replacement characters (wrong encoding)", () => {
    // Simulates a file read with the wrong encoding: >5 \uFFFD chars and a
    // replacement-char ratio well above the 2% threshold.
    const garbled = "Company Name,Contact\n" + "\uFFFD".repeat(50) + ",data,more";
    const result = analyzeCSV(garbled);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/doesn't look like a text CSV/i);
      expect(result.error).toMatch(/save it as CSV/i);
    }
  });

  it("accepts a file with a few stray replacement characters below the threshold", () => {
    // A handful of \uFFFD chars (≤5, and far under 2% of content) shouldn't
    // block an otherwise valid CSV — e.g. a couple of mangled accented names.
    const csv = [
      HEADER,
      "Acme Corp,Jos\uFFFD Garc\uFFFDa,jose@acme.com",
      "Globex Inc,Ren\uFFFDe Roe,rene@globex.com",
      "Initech,Bill Lumbergh,bill@initech.com",
    ].join("\n");
    const result = expectOk(analyzeCSV(csv));
    expect(result.records).toHaveLength(3);
    expect(result.malformed).toBe(0);
  });

  it("rejects a file whose header has only one column", () => {
    // A file with a single column cannot be a valid prospect export — it's
    // either a plain-text list or just a description column with no delimiter.
    const csv = [
      "Just a single column header",
      "Row one value",
      "Row two value",
    ].join("\n");
    const result = analyzeCSV(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/one column/i);
    }
  });

  it("recovers a UTF-16LE-encoded file (with BOM) instead of rejecting it", () => {
    const csv = [
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com",
    ].join("\n");
    const buffer = encodeUTF16LE(csv, { bom: true });
    const result = expectOk(analyzeCSVBuffer(buffer));
    expect(result.headers).toEqual(["Company Name", "Contact Name", "Email Address"]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]["Email Address"]).toBe("jane@acme.com");
  });

  it("recovers a UTF-16LE-encoded file without a BOM via retry", () => {
    const csv = [
      HEADER,
      "Acme Corp,Jane Doe,jane@acme.com",
      "Globex Inc,John Roe,john@globex.com",
    ].join("\n");
    const buffer = encodeUTF16LE(csv, { bom: false });
    const result = expectOk(analyzeCSVBuffer(buffer));
    expect(result.records).toHaveLength(2);
    expect(result.records[1]["Company Name"]).toBe("Globex Inc");
  });

  it("recovers a windows-1252 (Latin-1) export with accented names", () => {
    // "José García" in windows-1252: é=0xE9, í=0xED — invalid UTF-8 sequences.
    const line = "Acme Corp,Jos\xE9 Garc\xEDa,jose@acme.com";
    const csv = [HEADER, line, "Globex Inc,John Roe,john@globex.com"].join("\n");
    // But note: analyzeCSV's UTF-8 pass only fails when replacement chars are
    // dominant (>5 and >2%), so pack in enough accented rows to trip it.
    const accented = Array.from({ length: 10 }, (_, i) =>
      `Caf\xE9 N\xB0${i} S.A.,Jos\xE9 Garc\xEDa,jose${i}@caf\xE9.com`
    );
    const fullCsv = [HEADER, ...accented, line].join("\n");
    const bytes = new Uint8Array(fullCsv.length);
    for (let i = 0; i < fullCsv.length; i++) bytes[i] = fullCsv.charCodeAt(i) & 0xff;
    const result = expectOk(analyzeCSVBuffer(bytes.buffer));
    expect(result.records.length).toBe(11);
    expect(result.records[0]["Contact Name"]).toBe("José García");
    void csv;
  });

  it("still rejects a genuinely binary buffer after retries fail", () => {
    // xlsx (PK) signature — must not be 'recovered' by an alternate encoding.
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);
    const result = analyzeCSVBuffer(bytes.buffer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/xlsx/i);
    }
  });

  it("rejects when most data rows don't match the header column count", () => {
    // Rows with 2 cells vs. a 3-column header: they have multiple non-empty
    // cells so they are NOT noise lines — they are genuine mismatched rows.
    // With 2 mismatched rows and only 1 valid row, malformed > records.length,
    // which should surface the "most rows don't match" error.
    const csv = [
      "Company Name,Contact Name,Email Address",
      "Acme Corp,Jane Doe",           // 2 cells → mismatch (not noise: 2 non-empty cells)
      "Globex Inc,John Roe",          // 2 cells → mismatch (not noise)
      "Initech,Bill Lumbergh,bill@initech.com", // correct
    ].join("\n");
    const result = analyzeCSV(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/most rows/i);
    }
  });
});
