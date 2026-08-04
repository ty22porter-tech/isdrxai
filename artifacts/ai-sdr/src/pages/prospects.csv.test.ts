import { describe, it, expect } from "vitest";
import { analyzeCSV } from "./prospects";

// Narrow the CSVAnalysis union to the success shape so tests can read records/
// skippedRows/headers without repeating the `ok` guard everywhere.
function expectOk(result: ReturnType<typeof analyzeCSV>) {
  if (!result.ok) {
    throw new Error(`Expected analyzeCSV to succeed but it failed: ${result.error}`);
  }
  return result;
}

const HEADER = "Company Name,Contact Name,Email Address";

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
