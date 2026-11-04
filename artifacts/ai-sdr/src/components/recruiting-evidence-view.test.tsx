import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItResearch } from "@workspace/api-client-react";
import { ITResearchView } from "./it-research-view";
import { RecruitingEvidenceView } from "./recruiting-evidence-view";

const research = {
  selectedIndustry: "Manufacturing",
  actualIndustry: "Manufacturing",
  industryRelationship: "match",
  industryExplanation: "",
  industryChallenges: [],
  prospectConcerns: [],
  recommendations: [],
  warnings: [],
  recruiting: {
    employerIdentity: "confirmed",
    jobs: [
      { id: "j1", title: "Software Developer", employer: "Gulf Fab", location: "Houston, TX", roleFamily: "Technology", workArrangement: null, employmentType: null, department: null, seniority: null, salary: null, postedAt: null, firstSeenAt: "2026-01-01", lastVerifiedAt: "2026-01-03", status: "active", sourceURL: "https://jobs.example/1", evidence: "", requisitionId: null, urgent: false, verifiedReposting: false, hiringQuantity: null, noAgencies: true, agencyPolicyEvidence: "No agencies please" },
      { id: "j2", title: "Software Developer", employer: "Gulf Fab", location: "Houston, TX", roleFamily: "Technology", workArrangement: null, employmentType: null, department: null, seniority: null, salary: null, postedAt: null, firstSeenAt: "2026-01-01", lastVerifiedAt: "2026-01-02", status: "active", sourceURL: "https://board.example/1", evidence: "", requisitionId: null, urgent: false, verifiedReposting: false, hiringQuantity: null, noAgencies: false, agencyPolicyEvidence: null },
    ],
    growthSignals: [],
    coverage: [{ source: "Licensed job data", status: "unavailable", detail: "Not connected", lastSuccessfulResearch: null }],
    lastSuccessfulResearch: "2026-01-03",
    uniqueActiveJobs: 1,
    automationSuppressed: true,
    suppressionReasons: [],
    commercialFit: 62,
    evidenceConfidence: "high",
  },
} as unknown as ItResearch;

describe("recruiting research view", () => {
  it("shows pending Houston posting links directly on compact cards without counting them as active", () => {
    const pending = structuredClone(research.recruiting!);
    pending.jobs = [{ ...pending.jobs[0], status: "unknown" }];
    pending.uniqueActiveJobs = 0;
    pending.employerIdentity = "unverified";
    render(<RecruitingEvidenceView research={pending} compact />);
    expect(screen.getByTestId("badge-unique-jobs").textContent).toContain("0 unique active");
    expect(screen.getByText("1 sourced postings awaiting verification")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Software Developer.*Houston/ }).getAttribute("href")).toBe("https://jobs.example/1");
    expect(screen.getByText(/does not mean there are no openings/)).toBeTruthy();
  });
  it("shows verified title and source without expanding full research", () => {
    render(<RecruitingEvidenceView research={research.recruiting!} compact />);
    expect(screen.getByTestId("verified-job-links").textContent).toContain("Software Developer");
    expect(screen.getByRole("link", { name: /Software Developer.*Houston/ }).getAttribute("href")).toBe("https://jobs.example/1");
  });
  it("renders exact headings, separate fit/confidence, coverage, suppression, deduped jobs", () => {
    render(<ITResearchView research={research} sellerVertical="recruiting_staffing" />);
    expect(screen.getByText("Industry Hiring Challenges")).toBeTruthy();
    expect(screen.getByText("Prospect Hiring Needs")).toBeTruthy();
    expect(screen.getByText("Recommended Recruiting Solutions & Outreach")).toBeTruthy();
    expect(screen.getByTestId("badge-commercial-fit").textContent).toContain("62");
    expect(screen.getByTestId("badge-evidence-confidence").textContent).toMatch(/high/);
    expect(screen.getByTestId("status-automation-suppressed")).toBeTruthy();
    expect(screen.getByText(/Unavailable: Licensed job data/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-toggle-jobs"));
    expect(screen.getAllByText("Software Developer")).toHaveLength(1);
    expect(screen.getByText(/Posting age unknown/)).toBeTruthy();
    expect(screen.getByTestId("text-employer-industry").textContent).toContain("Manufacturing");
  });
  it("keeps IT headings for IT sellers", () => {
    const { recruiting: _r, ...it } = research as ItResearch & { recruiting?: unknown };
    render(<ITResearchView research={it as ItResearch} sellerVertical="it_services" />);
    expect(screen.getByText("Industry IT Challenges")).toBeTruthy();
  });
});
