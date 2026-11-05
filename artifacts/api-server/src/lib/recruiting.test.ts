import { describe, expect, it } from "vitest";
import type { ItResearch, usersTable, prospectsTable } from "@workspace/db";
import { parseRecruitingResearch, preserveDiscoveredHiring, recruitingAutomationBlocked, RECRUITING_INDUSTRIES } from "./recruitingResearch";
import { buildRecruitingOpportunity } from "./recruitingOpportunity";
import { filterRecruitingOpportunity, distanceMiles } from "./recruitingFilters";
import { recruitingPreMeetingBrief, recruitingQualificationSchema } from "./recruitingQualification";
import { belongsToVertical } from "./verticalScope";
import { getVerticalConfig, normalizeVertical, offeringForStep } from "./verticals";

const url = "https://employer.example/careers/123";
const otherUrl = "https://jobs.example/manufacturing-engineer";
const job = {
  title: "Software Engineer", employer: "Acme Manufacturing", location: "Houston, TX",
  roleFamily: "Technology", postedAt: null, status: "active",
  sourceURL: url, evidence: "Software Engineer, Houston, TX. Apply for this open position.",
  requisitionId: "req123",
};
function parse(overrides: Record<string, unknown> = {}, prior?: ReturnType<typeof parseRecruitingResearch>) {
  return parseRecruitingResearch({
    employerIdentity: "confirmed", jobs: [job], growthSignals: [], ...overrides,
  }, {
    companyName: "Acme Manufacturing", website: "https://employer.example",
    allowedSourceUrls: [url, otherUrl], identityVerified: true, prior,
  });
}
const seller = {
  vertical: "recruiting_staffing", businessName: "Specific Recruiter",
  sellerIntelligenceProfile: {
    status: "ready", websiteAnalysisStatus: "ready", sellerCompanyName: "Specific Recruiter",
    sellerServices: ["Engineering direct-hire recruiting"], sellerCapabilities: [],
    sellerProducts: [], sellerIndustriesServed: ["Manufacturing"],
  },
} as unknown as typeof usersTable.$inferSelect;
function report(recruiting = parse()): ItResearch {
  return {
    sellerVertical: "recruiting_staffing", selectedIndustry: "Manufacturing", actualIndustry: "Manufacturing",
    industryRelationship: "match", industryExplanation: "Manufacturer, not a technology company.",
    industrySources: [{ title: "Employer", url }], lastResearched: new Date().toISOString(), warnings: [],
    industryChallenges: [], prospectConcerns: [],
    recommendations: [{
      concernId: "hiring", prospectConcern: "Engineering hiring needs",
      offering: "Engineering direct-hire recruiting", howItHelps: "May support a targeted employer search.",
      businessValue: "A focused role search", outreachAngle: "Ask about the advertised engineering role.",
      discoveryQuestion: "Would outside support be useful?",
      sellerEvidence: { availability: "user_approved", sources: [] },
    }],
    recruiting,
  };
}
const lead = {
  companyName: "Acme Manufacturing", industry: "Manufacturing", city: "Houston", state: "TX",
  contactTitle: "HR Director", employeeCount: 100,
};
describe("Recruiting & Staffing industry", () => {
  it("retains a Houston posting omitted by completed research as unknown, not verified active", () => {
    const discovered = parse().jobs;
    const incomplete = parse({ employerIdentity: "unverified", jobs: [] });
    const result = preserveDiscoveredHiring(incomplete, discovered, "Acme Manufacturing");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ title: job.title, location: "Houston, TX", sourceURL: url, status: "unknown" });
    expect(result.uniqueActiveJobs).toBe(0);
    expect(result.employerIdentity).toBe("unverified");
    expect(result.automationSuppressed).toBe(true);
  });
  it("does not overwrite verified active or closed dispositions with discovery copies", () => {
    const discovered = parse().jobs;
    expect(preserveDiscoveredHiring(parse(), discovered, "Acme Manufacturing").uniqueActiveJobs).toBe(1);
    const closed = parse({ jobs: [{ ...job, status: "closed" }] });
    const result = preserveDiscoveredHiring(closed, discovered, "Acme Manufacturing");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].status).toBe("closed");
    expect(result.uniqueActiveJobs).toBe(0);
  });
  it("preserves discovery agency restrictions but rejects another employer's posting", () => {
    const discovered = parse({ jobs: [{ ...job, agencyPolicyEvidence: "No agencies please" }] }).jobs;
    const result = preserveDiscoveredHiring(parse(), discovered, "Acme Manufacturing");
    expect(result.jobs[0].noAgencies).toBe(true);
    expect(result.automationSuppressed).toBe(true);
    expect(preserveDiscoveredHiring(parse({ jobs: [] }), discovered, "Unrelated Employer").jobs).toEqual([]);
  });
  it("is a first-class vertical and exposes exactly seven employer industries", () => {
    expect(normalizeVertical("recruiting_staffing")).toBe("recruiting_staffing");
    expect(getVerticalConfig("recruiting_staffing").label).toBe("Recruiting & Staffing");
    expect(RECRUITING_INDUSTRIES).toEqual(["Healthcare", "Oil & Gas", "Technology", "Financial Services", "Engineering", "Manufacturing", "Logistics & Warehousing"]);
    expect(getVerticalConfig("recruiting_staffing").offerings).toEqual([]);
    expect(offeringForStep(getVerticalConfig("recruiting_staffing"), 1)).toContain("approved seller profile");
    expect(getVerticalConfig("it_services").serviceNoun).toBe("managed IT services");
  });
  it("keeps employer industry distinct from a job's role family and unknown posting age", () => {
    const result = parse();
    expect(result.jobs[0].roleFamily).toBe("Technology");
    expect(result.jobs[0].postedAt).toBeNull();
    expect(result.jobs[0].hiringQuantity).toBeNull();
    expect(result.uniqueActiveJobs).toBe(1);
    expect(report(result).actualIndustry).toBe("Manufacturing");
  });
  it("deduplicates syndicated listings without multiplying hires", () => {
    const result = parse({ jobs: [job, { ...job, sourceURL: otherUrl, hiringQuantity: 20 }] });
    expect(result.jobs).toHaveLength(1);
    expect(result.uniqueActiveJobs).toBe(1);
    expect(result.jobs[0].hiringQuantity).toBeNull();
  });
  it("removes closed jobs from active counts and does not retain old absent openings", () => {
    const old = parse();
    expect(parse({ jobs: [{ ...job, status: "closed" }] }, old).uniqueActiveJobs).toBe(0);
    expect(parse({ jobs: [] }, old).uniqueActiveJobs).toBe(0);
    expect(parse({ jobs: [job, { ...job, sourceURL: otherUrl, status: "closed" }] }).uniqueActiveJobs).toBe(0);
  });
  it("rejects unsupported source URLs and advertisements for an unidentified end employer", () => {
    expect(parse({ jobs: [{ ...job, sourceURL: "https://invented.example/job" }] }).jobs).toEqual([]);
    expect(parse({ jobs: [{ ...job, employer: "Agency advertising for unnamed client" }] }).jobs).toEqual([]);
    const unknown = parse({ employerIdentity: "agency_unidentified" });
    expect(unknown.automationSuppressed).toBe(true);
    expect(filterRecruitingOpportunity(buildRecruitingOpportunity(lead, seller, report(unknown)), {}, lead)).toBe(false);
  });
  it("suppresses agency-prohibited pitches and exposes the policy evidence", () => {
    const hiring = parse({ jobs: [{ ...job, agencyPolicyEvidence: "No agencies or unsolicited resumes." }] });
    expect(hiring.jobs[0].noAgencies).toBe(true);
    expect(hiring.automationSuppressed).toBe(true);
    const intelligence = buildRecruitingOpportunity(lead, seller, report(hiring));
    expect(intelligence.score).toBe(0);
    expect(intelligence.itResearch?.recommendations).toEqual([]);
    expect(recruitingAutomationBlocked({ vertical: "recruiting_staffing", opportunityIntelligence: intelligence })).toBe(true);
    expect(recruitingAutomationBlocked({ vertical: "recruiting_staffing" })).toBe(true);
    expect(recruitingAutomationBlocked({ vertical: "it_services" })).toBe(false);
  });
  it("does not infer urgency, reposting or hire quantity from a bare listing", () => {
    const result = parse({ jobs: [{ ...job, urgent: true, verifiedReposting: true, hiringQuantity: 8 }] });
    expect(result.jobs[0]).toMatchObject({ urgent: false, verifiedReposting: false, hiringQuantity: null });
  });
  it.each([
    "https://jobs.boeing.com/location/dallas-texas-united-states-jobs/185/6252001/4",
    "https://jobs.lever.co/example?location=Dallas",
    "https://boards.greenhouse.io/example",
  ])("keeps a general job board pending instead of treating it as an active opening: %s", sourceURL => {
    const research = parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [{ ...job, sourceURL }] }, {
      companyName: job.employer, identityVerified: true, allowedSourceUrls: [sourceURL],
    });
    expect(research.jobs).toHaveLength(1);
    expect(research.jobs[0].status).toBe("unknown");
    expect(research.uniqueActiveJobs).toBe(0);
  });
  it("blocks a cited employer-wide no-agencies policy even without any job listings", () => {
    const hiring = parse({ jobs: [], agencyPolicies: [{ sourceURL: url, evidence: "We do not accept unsolicited resumes from agencies." }] });
    expect(hiring.automationSuppressed).toBe(true);
    expect(hiring.suppressionReasons.join(" ")).toContain(url);
    expect(parse({ jobs: [], agencyPolicies: [{ sourceURL: "https://invented.example", evidence: "No agencies" }] }).automationSuppressed).toBe(false);
  });
  it("does not treat formation or relocation alone as confirmed hiring", () => {
    const hiring = parse({ growthSignals: [
      { type: "formation", title: "New legal entity", location: "Houston", sourceURL: url, evidence: "Business formed.", confirmedHiring: true, hiringPlans: "Hiring" },
      { type: "relocation", title: "Office relocation", location: "Austin", sourceURL: otherUrl, evidence: "Office relocating to Austin.", confirmedHiring: true, hiringPlans: "New staff" },
    ], jobs: [] });
    expect(hiring.growthSignals.every(signal => !signal.confirmedHiring)).toBe(true);
    const intelligence = buildRecruitingOpportunity(lead, seller, report(hiring));
    expect(intelligence.breakdown.find(category => category.key === "verified_buying_signals")?.points).toBe(0);
  });
  it("deduplicates syndicated growth events before scoring", () => {
    const signal = { type: "expansion", title: "New plant", location: "Houston", sourceURL: url,
      evidence: "The new plant will hire 20 employees.", confirmedHiring: true, hiringPlans: "20 employees" };
    const result = parse({ growthSignals: [signal, { ...signal, sourceURL: otherUrl, title: "Plant expansion" }] });
    expect(result.growthSignals).toHaveLength(1);
  });
  it("preserves server first-seen dates on refresh and shows truthful source coverage", () => {
    const prior = parse();
    prior.jobs[0].firstSeenAt = "2026-01-01T00:00:00.000Z";
    const refreshed = parse({}, prior);
    expect(refreshed.jobs[0].firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
    expect(refreshed.coverage.find(source => source.source.includes("Licensed"))?.status).toBe("unavailable");
    expect(refreshed.lastSuccessfulResearch).toBeTruthy();
  });
  it("explains a summed score independently of commercial fit and evidence confidence", () => {
    const intelligence = buildRecruitingOpportunity(lead, seller, report());
    expect(intelligence.breakdown.reduce((sum, category) => sum + category.maxPoints, 0)).toBe(100);
    expect(intelligence.breakdown.reduce((sum, category) => sum + category.points, 0)).toBe(intelligence.score);
    expect(intelligence.itResearch?.recruiting?.commercialFit).toBeGreaterThan(0);
    expect(intelligence.itResearch?.recruiting?.evidenceConfidence).not.toBe("high");
    expect(intelligence.definition).toContain("Not engagement");
    expect(intelligence.recommendedOutreach).toContain("do not imply available candidates");
  });
  it("does not recommend a service absent from the seller's catalog", () => {
    const intelligence = buildRecruitingOpportunity(lead, undefined, report());
    expect(intelligence.itResearch?.recommendations).toEqual([]);
    expect(intelligence.score).toBeLessThan(30);
    expect(intelligence.breakdown.reduce((sum, category) => sum + category.points, 0)).toBe(intelligence.score);
  });
  it("enforces role, job-count, date, size and service filters against known evidence", () => {
    const intelligence = buildRecruitingOpportunity(lead, seller, report());
    expect(filterRecruitingOpportunity(intelligence, { jobTitles: "Engineer", companySize: "51-200", minRelevantJobs: 1 }, lead)).toBe(true);
    expect(filterRecruitingOpportunity(intelligence, { jobTitles: "Nurse" }, lead)).toBe(false);
    expect(filterRecruitingOpportunity(intelligence, { minRelevantJobs: 2 }, lead)).toBe(false);
    expect(filterRecruitingOpportunity(intelligence, { recencyDays: 30 }, lead)).toBe(false);
    expect(filterRecruitingOpportunity(intelligence, { companySize: "501+" }, lead)).toBe(false);
    expect(filterRecruitingOpportunity(intelligence, { companySize: "51-200" }, { ...lead, employeeCount: null })).toBe(false);
    expect(distanceMiles({ latitude: 29.7604, longitude: -95.3698 }, { latitude: 29.7604, longitude: -95.3698 })).toBe(0);
  });
  it("keeps qualification facts separate from research and carries them into the brief", () => {
    const disclosed = { roles: "3 engineers", targetStartDates: "January", currentAgencies: "Disclosed Agency", agencyRenewalDates: "2027-03-01" };
    expect(recruitingQualificationSchema.safeParse(disclosed).success).toBe(true);
    expect(recruitingQualificationSchema.safeParse({ roles: "x".repeat(2001) }).success).toBe(false);
    const brief = recruitingPreMeetingBrief({ ...lead, vertical: "recruiting_staffing",
      contactName: "Example Stakeholder", title: "HR Director", recruitingQualification: disclosed,
      opportunityIntelligence: buildRecruitingOpportunity(lead, seller, report()),
    } as unknown as typeof prospectsTable.$inferSelect);
    expect(brief).toContain("3 engineers");
    expect(brief).toContain("Disclosed Agency");
    expect(brief).toContain("2027-03-01");
    expect(brief).toContain("Not disclosed");
    expect(brief).toContain(url);
  });
  it("isolates recruiting records from other verticals and legacy unstamped rows", () => {
    expect(belongsToVertical("recruiting_staffing", "recruiting_staffing")).toBe(true);
    expect(belongsToVertical("it_services", "recruiting_staffing")).toBe(false);
    expect(belongsToVertical(null, "recruiting_staffing")).toBe(false);
    expect(belongsToVertical("recruiting_staffing", "it_services")).toBe(false);
    expect(belongsToVertical(null, "it_services")).toBe(true);
  });
});
