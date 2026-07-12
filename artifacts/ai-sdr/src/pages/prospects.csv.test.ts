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
