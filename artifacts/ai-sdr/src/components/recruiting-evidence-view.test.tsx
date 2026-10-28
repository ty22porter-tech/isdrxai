import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItResearch } from "@workspace/api-client-react";
import { ITResearchView } from "./it-research-view";

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
