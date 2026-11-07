import { describe, it, expect } from "vitest";
import { recruitingOpeningSummary, ensureRecruitingOpeningPlaceholder } from "@workspace/db/recruiting-email";
import { mergeEmailTemplate } from "./email-template";

const job = (title: string, status = "active") => ({ title, status, location: "Houston, TX", noAgencies: false, sourceURL: "https://employer.example/jobs/1", evidence: "Published role" });
const recipient = (jobs: any[], overrides = {}) => ({ contactName: "Pat Jones", companyName: "Employer", opportunityIntelligence: { itResearch: { recruiting: { employerIdentity: "confirmed", automationSuppressed: false, jobs, ...overrides } } } } as any);

describe("recruiting campaign opening personalization", () => {
  it("merges only active sourced roles and locations for this employer", () => {
    const lead = recipient([job("Registered Nurse"), job("Medical Assistant"), job("Closed role", "closed"), job("Unknown role", "unknown"), { ...job("Restricted role"), noAgencies: true }, { ...job("No evidence"), evidence: "" }, job("Registered Nurse")]);
    const body = mergeEmailTemplate("Hi {{contactName}},\n\n{{jobOpenings}}\n\nCould we discuss staffing?", lead);
    expect(body).toContain("Hi Pat,");
    expect(body).toContain("Registered Nurse (Houston, TX); Medical Assistant (Houston, TX)");
    expect(body.match(/Registered Nurse/g)).toHaveLength(1);
    expect(body).not.toMatch(/Closed role|Unknown role|Restricted role|No evidence|\{\{/);
  });
  it.each([{ employerIdentity: "unverified" }, { automationSuppressed: true }, { jobs: [] }])("does not assert hiring without usable research: %j", overrides => {
    expect(recruitingOpeningSummary(recipient([job("Registered Nurse")], overrides))).toBe("I'd like to understand which roles, if any, your team is hiring for.");
  });
  it("caps long lists without implying a number of hires", () => {
    expect(recruitingOpeningSummary(recipient([1,2,3,4].map(n => job(`Role ${n}`))))).not.toContain("Role 4");
  });
  it("adds the reusable field once, without inventing sample vacancies", () => {
    const template = ensureRecruitingOpeningPlaceholder("Hi {{contactName}},\n\nCould we discuss staffing?");
    expect(template).toBe("Hi {{contactName}},\n\n{{jobOpenings}}\n\nCould we discuss staffing?");
    expect(ensureRecruitingOpeningPlaceholder(template)).toBe(template);
    expect(mergeEmailTemplate(template, {})).not.toContain("{{");
  });
});

it("places a missing opening field after the conversational introduction", () => {
  expect(ensureRecruitingOpeningPlaceholder("Hi {{contactName}},\n\nI wanted to ask how your team handles recruiting.\n\nAt our company, we offer approved staffing services.\n\nCould we talk?"))
    .toBe("Hi {{contactName}},\n\nI wanted to ask how your team handles recruiting.\n\n{{jobOpenings}}\n\nAt our company, we offer approved staffing services.\n\nCould we talk?");
});
