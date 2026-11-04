import { describe, expect, it } from "vitest";
import type { ProspectLead } from "@workspace/api-client-react";
import { recruitingContactEligible } from "./recruitingContactEligibility";

const hiring = { employerIdentity: "confirmed", automationSuppressed: false, commercialFit: 80,
  jobs: [{ status: "active", noAgencies: false }] };
const lead = (changes = {}, reportChanges = {}, hiringChanges = {}) => ({
  ...changes, opportunityIntelligence: { itResearch: {
    industryRelationship: "match", recommendations: [{}], ...reportChanges,
    recruiting: { ...hiring, ...hiringChanges },
  } },
} as unknown as ProspectLead);

describe("recruiting contact eligibility", () => {
  it("allows contact lookup only for a qualified employer", () => {
    expect(recruitingContactEligible(lead())).toBe(true);
  });
  it.each([{ outsideSelectedFilters: true }, { researchError: "Failed" }])("blocks review-only and failed rows: %j", changes => {
    expect(recruitingContactEligible(lead(changes))).toBe(false);
  });
  it.each([{ industryRelationship: "uncertain" }, { recommendations: [] }])("requires research-backed industry and service fit: %j", changes => {
    expect(recruitingContactEligible(lead({}, changes))).toBe(false);
  });
  it.each([{ employerIdentity: "unverified" }, { automationSuppressed: true }, { commercialFit: 0 },
    { jobs: [] }, { jobs: [{ status: "closed", noAgencies: false }] },
    { jobs: [{ status: "active", noAgencies: true }] }])("blocks unqualified hiring research: %j", changes => {
    expect(recruitingContactEligible(lead({}, {}, changes))).toBe(false);
  });
});
