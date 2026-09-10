import { describe, expect, it } from "vitest";
import { mergeEmailTemplate } from "./email-template";

const recipient = {
  contactName: "Angela Morris",
  companyName: "Lone Star Facility Solutions",
  city: "Dallas",
  state: "TX",
};

describe("email draft personalization", () => {
  it.each(["Janitorial", "IT Services", "Fleet & Vehicle Wraps"])(
    "uses first name for all seven %s preview steps",
    (industry) => {
      for (let step = 1; step <= 7; step++) {
        expect(mergeEmailTemplate(
          `Hi {{contactName}},\n\nStep ${step}: {{companyName}} in {{city}}, {{state}} — {{industry}}`,
          { ...recipient, industry },
        )).toBe(`Hi Angela,\n\nStep ${step}: Lone Star Facility Solutions in Dallas, TX — ${industry}`);
      }
    },
  );

  it.each(["Hi", "Hello", "Dear", "Hey"])("repairs a saved %s full-name greeting only", (greeting) => {
    expect(mergeEmailTemplate(
      `${greeting} Angela Morris,\n\nAngela Morris is the contact on file.`,
      recipient,
    )).toBe(`${greeting} Angela,\n\nAngela Morris is the contact on file.`);
  });

  it("preserves a single first name and supports missing names", () => {
    expect(mergeEmailTemplate("Hi {{contactName}},", { contactName: "Angela" })).toBe("Hi Angela,");
    expect(mergeEmailTemplate("Company: {{companyName}}", {})).toBe("Company: ");
  });

  it("escapes punctuation in names when repairing greetings", () => {
    expect(mergeEmailTemplate("Hi Angela M. (Sales),", { contactName: "Angela M. (Sales)" })).toBe("Hi Angela,");
  });
});