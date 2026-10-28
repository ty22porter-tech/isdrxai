import { describe, expect, it } from "vitest";
import type { RecruitingJob } from "@workspace/api-client-react";
import {
  RECRUITING_INDUSTRIES, normalizeVertical, toRecruitingFiltersPayload, DEFAULT_RECRUITING_FILTERS,
  dedupeJobs, postingAgeLabel, cleanQualification, loadRecruitingFilters, saveRecruitingFilters, clearRecruitingFilters,
} from "./recruiting";
import { generateIntroEmail, generateFollowUpEmail } from "./email-ai";

const job = (o: Partial<RecruitingJob>): RecruitingJob => ({
  id: "1", title: "RN", employer: "Mercy", location: "Tulsa, OK", roleFamily: null, workArrangement: null,
  employmentType: null, department: null, seniority: null, salary: null, postedAt: null,
  firstSeenAt: "2026-01-01", lastVerifiedAt: "2026-01-02", status: "active", sourceURL: "https://x", evidence: "",
  requisitionId: null, urgent: false, verifiedReposting: false, hiringQuantity: null, noAgencies: false, agencyPolicyEvidence: null, ...o,
});

describe("recruiting vertical", () => {
  it("offers all seven employer industries", () => {
    expect(RECRUITING_INDUSTRIES).toHaveLength(7);
    expect(RECRUITING_INDUSTRIES).toContain("Oil & Gas");
  });
  it("never falls through to janitorial", () => {
    expect(normalizeVertical("recruiting_staffing")).toBe("recruiting_staffing");
    expect(normalizeVertical(undefined)).toBe("janitorial");
  });
  it("builds payload omitting empty filters", () => {
    const p = toRecruitingFiltersPayload({ ...DEFAULT_RECRUITING_FILTERS, industries: ["Healthcare", "Manufacturing"], minRelevantJobs: "3" });
    expect(p).toEqual({ industries: ["Healthcare", "Manufacturing"], minRelevantJobs: 3, serviceMatchOnly: true });
  });
  it("dedupes syndicated listings", () => {
    const jobs = dedupeJobs([job({ id: "a" }), job({ id: "b", title: " rn " }), job({ id: "c", requisitionId: "R1" }), job({ id: "d", requisitionId: "r1", title: "Other" })]);
    expect(jobs).toHaveLength(2);
  });
  it("labels unknown posting age", () => {
    expect(postingAgeLabel(null)).toBe("Posting age unknown");
  });
  it("cleans qualification", () => {
    expect(cleanQualification({ roles: " RN ", budget: "  " })).toEqual({ roles: "RN" });
  });
  it("persists and clears filters per user", () => {
    saveRecruitingFilters("u1", { ...DEFAULT_RECRUITING_FILTERS, industries: ["Technology"] });
    expect(loadRecruitingFilters("u1").industries).toEqual(["Technology"]);
    clearRecruitingFilters("u1");
    expect(loadRecruitingFilters("u1").industries).toEqual([]);
  });
});

describe("recruiting email fallback", () => {
  const prospect = { contactName: "Ana Ruiz", companyName: "Gulf Fab", industry: "Manufacturing", city: "Houston" };
  it("uses discovery language without seller profile and never claims candidates", () => {
    const r = generateIntroEmail(prospect, "recruiting_staffing");
    expect(r.subject).toMatch(/Hiring/);
    expect(r.body).not.toMatch(/candidate|placed|guarantee/i);
    expect(r.body).not.toMatch(/janitorial|cleaning/i);
  });
  it("names only a verified seller offering", () => {
    const r = generateIntroEmail(prospect, "recruiting_staffing", {
      status: "ready", researchVersion: 2, researchStatus: "ready", sellerCompanyName: "Talent Forge",
      sellerServices: ["contract staffing for skilled trades"],
    });
    expect(r.body).toContain("contract staffing for skilled trades");
    expect(r.body).not.toMatch(/executive search|RPO/i);
    expect(generateFollowUpEmail(prospect, "recruiting_staffing").subject).toMatch(/hiring question/i);
  });
});
