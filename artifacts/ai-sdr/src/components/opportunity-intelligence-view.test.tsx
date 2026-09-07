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
    expect(screen.getByText("Verified signal:")).toBeInTheDocument();
    expect(screen.getByText("Recommended outreach:")).toBeInTheDocument();
    expect(screen.getByText(/actively hiring service technicians/)).toBeInTheDocument();
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