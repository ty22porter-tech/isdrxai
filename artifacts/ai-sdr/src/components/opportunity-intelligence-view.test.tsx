import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OpportunityIntelligence, OpportunitySignal } from "@workspace/api-client-react";
import { OpportunityIntelligenceView } from "./opportunity-intelligence-view";

const signal = (overrides: Partial<OpportunitySignal>): OpportunitySignal => ({
  signalType: "unknown",
  signalTitle: "Signal",
  signalDescription: "Signal description",
  signalClassification: "unconfirmed",
  confidenceLevel: "medium",
  freshness: "unknown",
  dateDiscovered: "2026-09-06",
  points: 0,
  ...overrides,
});

const intelligence = (signals: OpportunitySignal[]): OpportunityIntelligence => ({
  version: 1,
  score: 60,
  label: "Possible Fit",
  scoreConfidence: "medium",
  definition: "Seller fit",
  breakdown: [],
  signals,
  whyTarget: "Industry fit",
  potentialNeeds: [],
  recommendedOutreach: "Use discovery-oriented outreach.",
  generatedAt: "2026-09-06",
});

describe("OpportunityIntelligenceView", () => {
  it("shows complete compact responses up to five sentences without ellipses", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([]),
          whyTarget: "First complete sentence. Second complete sentence. Third complete sentence. Fourth complete sentence. Fifth complete sentence. Sixth sentence should not render.",
        }}
      />,
    );

    expect(screen.getByText(/First complete sentence.+Fifth complete sentence\./)).toBeInTheDocument();
    expect(screen.queryByText(/Sixth sentence should not render/)).not.toBeInTheDocument();
    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
  });

  it("removes repeated legacy employee-profile copy and replaces old outreach scripting with refresh guidance", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([]),
          whyTarget: "American Healthcare Services has a sourced company-size profile as a 63-employee organization where scalable support may become important.",
          potentialNeeds: ["American Healthcare Services's sourced profile indicates a 63-employee organization where scalable support may become important."],
          recommendedOutreach: "For American Healthcare Services, tailor the approach to its verified profile as a 63-employee organization where scalable support, onboarding, identity, endpoint, and security processes may become increasingly important. Lead with managed IT services.",
        }}
      />,
    );

    expect(screen.queryByText("Why target:")).not.toBeInTheDocument();
    expect(screen.queryByText("Potential needs:")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-opportunity-intelligence-compact")).toHaveTextContent(
      "Outreach: Refresh Intelligence to verify seller sources",
    );
    expect(screen.queryByText(/tailor the approach/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ask how its 63-person team handles onboarding/)).not.toBeInTheDocument();
  });

  it("removes repeated legacy employee-profile copy from the expanded view", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...intelligence([]),
          whyTarget: "American Healthcare Services has a sourced company-size profile as a 63-employee organization where scalable support may become important.",
          potentialNeeds: ["American Healthcare Services's sourced profile indicates a 63-employee organization where scalable support may become important."],
          recommendedOutreach: "For American Healthcare Services, tailor the approach to its verified profile as a 63-employee organization where scalable support may become important.",
        }}
      />,
    );

    expect(screen.queryByText("Why Target")).not.toBeInTheDocument();
    expect(screen.queryByText("Potential Opportunities")).not.toBeInTheDocument();
    expect(screen.getByTestId("legacy-seller-sources-guidance")).toHaveTextContent(
      "Refresh Intelligence to verify seller sources",
    );
    expect(screen.queryByText(/ask how its 63-person team handles onboarding/)).not.toBeInTheDocument();
  });

  it("shows the prospect criteria that earned score points", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...intelligence([]),
          score: 12,
          breakdown: [{
            key: "company_industry_fit",
            label: "Company / ICP Fit",
            points: 12,
            maxPoints: 20,
            explanation: "Points come from verified prospect fields.",
            evidence: [
              "A published operating address supports company identity and market fit. (+4)",
              "A published company website supports company and industry fit. (+5)",
            ],
          }],
        }}
      />,
    );

    expect(screen.getByText("12 / 20 pts")).toBeInTheDocument();
    expect(screen.getByText("A published operating address supports company identity and market fit. (+4)")).toBeInTheDocument();
    expect(screen.getByText("A published company website supports company and industry fit. (+5)")).toBeInTheDocument();
  });

  it("keeps the prospect-card view short and omits empty or negative findings", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([
            signal({
              signalType: "hiring",
              signalTitle: "Hiring service technicians",
              signalDescription: "Open roles are listed in Dallas.",
              signalClassification: "verified",
              points: 10,
            }),
            signal({
              signalTitle: "Unverified fleet size",
              signalClassification: "unconfirmed",
            }),
          ]),
          whyTarget:
            "Verified: the company is actively hiring service technicians. No meaningful company-specific fleet signal was found.",
          potentialNeeds: [
            "Support field teams during growth",
            "Improve onboarding for new technicians",
            "No relevant third opportunity found",
          ],
          recommendedOutreach:
            "Lead with the verified hiring activity and ask how the team supports new field technicians.",
        }}
      />,
    );

    expect(screen.getByTestId("section-opportunity-intelligence-compact")).toBeInTheDocument();
    expect(screen.getByText("Why target:")).toBeInTheDocument();
    expect(screen.getByText("Potential needs:")).toBeInTheDocument();
    expect(screen.queryByText("Verified signal:")).not.toBeInTheDocument();
    expect(screen.getByText("Outreach:")).toBeInTheDocument();
    expect(screen.getByText(/actively hiring service technicians/)).toBeInTheDocument();
    expect(screen.getByText("Refresh Intelligence to verify seller sources")).toBeInTheDocument();
    expect(screen.queryByText(/No meaningful/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unverified fleet size/)).not.toBeInTheDocument();
    expect(screen.queryByText(/third opportunity/)).not.toBeInTheDocument();
    expect(screen.queryByText("Verified Buying Signals")).not.toBeInTheDocument();
  });

  it("skips compact rows that have no useful result", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([]),
          whyTarget: "No meaningful company-specific buying signal found yet.",
          potentialNeeds: [],
          recommendedOutreach: "No relevant outreach recommendation found.",
        }}
      />,
    );

    expect(screen.queryByTestId("section-opportunity-intelligence-compact")).not.toBeInTheDocument();
  });

  it("hides non-scoring company operating evidence from the compact summary", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([
            signal({
              signalType: "company_operating_profile",
              signalTitle: "Apollo company operating evidence",
              signalDescription: "Perfect General Contractors provides commercial construction management across North Texas.",
              signalClassification: "verified",
              points: 0,
            }),
          ]),
          whyTarget: "Official company operating evidence supports discovery.",
          potentialNeeds: ["Ask how technology supports its documented project operations."],
          recommendedOutreach: "Ask which project workflows depend on reliable access and support.",
        }}
      />,
    );

    expect(screen.queryByText("Verified signal:")).not.toBeInTheDocument();
    expect(screen.queryByText(/commercial construction management across North Texas/)).not.toBeInTheDocument();
  });

  it("hides Apollo wording from cached company evidence and marks scores of 30 as fit to call", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...intelligence([
            signal({
              signalType: "company_operating_profile",
              signalTitle: "Apollo company operating evidence",
              signalDescription: "A documented company operation.",
              sourceName: "Apollo company enrichment",
              signalClassification: "verified",
              points: 0,
            }),
          ]),
          score: 30,
          label: "Possible Fit",
        }}
      />,
    );

    expect(screen.getByText("Fit to Call")).toBeInTheDocument();
    expect(screen.getByText("Company operating profile")).toBeInTheDocument();
    expect(screen.queryByText(/Apollo/i)).not.toBeInTheDocument();
  });

  it("separates company verification from verified buying signals", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={intelligence([
          signal({
            signalType: "business_listing",
            signalTitle: "Active Google Places listing",
            signalClassification: "verified",
          }),
        ])}
      />,
    );

    expect(screen.getByText("Active Google Places listing")).toBeInTheDocument();
    expect(screen.getByTestId("status-empty-verified")).toHaveTextContent(
      "No meaningful company-specific buying signal found yet.",
    );
  });

  it("shows hiring details and expandable evidence without inventing a count", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={intelligence([
          signal({
            signalType: "hiring",
            signalTitle: "Hiring Service Technicians",
            signalDescription: "Multiple openings listed in Dallas.",
            signalClassification: "verified",
            confidenceLevel: "high",
            freshness: "recent",
            sourceName: "Company Careers Page",
            sourceURL: "https://example.com/careers",
            sourceDate: "2026-08-29",
            dateVerified: "2026-09-06",
            supportingEvidence: "Service Technician roles are currently listed.",
            points: 10,
          }),
        ])}
      />,
    );

    expect(screen.getByText("Hiring Signal")).toBeInTheDocument();
    expect(screen.queryByText(/Openings:/)).not.toBeInTheDocument();
    expect(screen.getByText("Dallas")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("View evidence details")[0]);
    expect(screen.getAllByText("Company Careers Page").length).toBeGreaterThan(0);
    expect(screen.getByText("Service Technician roles are currently listed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Company Careers Page/ })).toHaveAttribute(
      "href",
      "https://example.com/careers",
    );
  });

  it("labels legacy potential needs as unconfirmed opportunities", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...intelligence([]),
          potentialNeeds: ["Vehicle identification may be relevant"],
          recommendedOutreach: "Do not claim a confirmed need.",
        }}
      />,
    );

    expect(screen.getByText("Potential Opportunities")).toBeInTheDocument();
    expect(screen.getByText(/Unconfirmed — validate during discovery/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmed need/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/potential opportunit/i).length).toBeGreaterThan(0);
  });

  it("does not present verified but seller-irrelevant hiring as a buying signal", () => {
    render(<OpportunityIntelligenceView intelligence={intelligence({
      signals: [{
        signalType: "hiring_listing",
        signalTitle: "Official job listing: Office Administrator",
        signalDescription: "A verified office role is listed.",
        signalClassification: "verified",
        confidenceLevel: "high",
        freshness: "recent",
        dateDiscovered: "2026-09-01",
        points: 0,
      }],
    })} />);
    expect(screen.queryByText("Official job listing: Office Administrator")).not.toBeInTheDocument();
    expect(screen.queryByText("Hiring signal")).not.toBeInTheDocument();
  });
});