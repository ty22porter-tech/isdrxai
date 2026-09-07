import { describe, expect, it } from "vitest";
import { findExactHhsBreachRecord, parseHhsBreachRecords } from "./publicBreachResearch";

describe("public breach research", () => {
  it("parses structured HHS OCR breach-report rows", () => {
    const html = `<tbody id="ocrForm:reportResultTable_data">
      <tr data-ri="0" data-rk="1480915">
        <td><div class="ui-row-toggler"></div></td>
        <td><span>AnMed Health</span></td>
        <td>SC</td>
        <td><span>Healthcare Provider</span></td>
        <td>501</td>
        <td>08/27/2026</td>
        <td><span>Hacking/IT Incident</span></td>
        <td><span>Network Server</span></td>
      </tr>
    </tbody>`;

    expect(parseHhsBreachRecords(html)).toEqual([{
      organizationName: "AnMed Health",
      state: "SC",
      coveredEntityType: "Healthcare Provider",
      individualsAffected: "501",
      submissionDate: "08/27/2026",
      breachType: "Hacking/IT Incident",
      informationLocation: "Network Server",
    }]);
  });

  it("ignores unrelated table rows", () => {
    expect(parseHhsBreachRecords("<tr><td>Navigation</td></tr>")).toEqual([]);
  });

  it("requires an exact normalized organization name and matching state", () => {
    const records = [{
      organizationName: "AnMed Health",
      state: "SC",
      coveredEntityType: "Healthcare Provider",
      individualsAffected: "501",
      submissionDate: "08/27/2026",
      breachType: "Hacking/IT Incident",
      informationLocation: "Network Server",
    }];

    expect(findExactHhsBreachRecord(records, "AnMed Health", "SC")).toBe(records[0]);
    expect(findExactHhsBreachRecord(records, "AnMed", "SC")).toBeUndefined();
    expect(findExactHhsBreachRecord(records, "AnMed Health", "NC")).toBeUndefined();
  });
});