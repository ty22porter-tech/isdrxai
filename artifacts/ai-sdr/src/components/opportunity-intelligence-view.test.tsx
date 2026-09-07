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
            "The company operates a customer-facing field-service business. No current fleet expansion or vehicle purchase has been verified.",
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
    expect(screen.getByText(/customer-facing field-service business/)).toBeInTheDocument();
    expect(screen.getByText(/No current fleet expansion/)).toBeInTheDocument();
    expect(screen.queryByText(/Unverified fleet size/)).not.toBeInTheDocument();
    expect(screen.queryByText(/third opportunity/)).not.toBeInTheDocument();
    expect(screen.queryByText("Verified Buying Signals")).not.toBeInTheDocument();
  });

  it("shows an honest why-target conclusion while skipping other empty rows", () => {
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

    expect(screen.getByTestId("section-opportunity-intelligence-compact")).toBeInTheDocument();
    expect(screen.getByText(/No meaningful company-specific buying signal/)).toBeInTheDocument();
    expect(screen.queryByText("Potential needs:")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified signal:")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended outreach:")).not.toBeInTheDocument();
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

  it("shows verified business-model evidence with its source in the full breakdown", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={intelligence([
          signal({
            signalType: "business_model_evidence",
            signalTitle: "Verified vehicle-centered operating model",
            signalDescription: "The official website describes passenger transportation service.",
            signalClassification: "verified",
            confidenceLevel: "high",
            sourceName: "Official company website",
            sourceURL: "https://example.com/about",
            supportingEvidence: "Premium intercity bus service across Texas.",
          }),
        ])}
      />,
    );

    expect(screen.getByText("Verified Business Model")).toBeInTheDocument();
    expect(screen.getAllByText("Verified vehicle-centered operating model")).toHaveLength(1);
    fireEvent.click(screen.getByText("View evidence details"));
    expect(screen.getByRole("link", { name: /Official company website/ })).toHaveAttribute(
      "href",
      "https://example.com/about",
    );
  });

  it("shows the strongest current verified signal in the compact card", () => {
    render(
      <OpportunityIntelligenceView
        compact
        intelligence={{
          ...intelligence([
            signal({
              signalType: "hiring_listing",
              signalTitle: "Official job listing: Driver",
              signalDescription: "A current driver role is listed.",
              signalClassification: "verified",
              freshness: "recent",
              points: 6,
            }),
            signal({
              signalType: "vehicle_purchase",
              signalTitle: "Verified vehicle purchase",
              signalDescription: "Twelve new motorcoaches were purchased.",
              signalClassification: "verified",
              freshness: "recent",
              points: 14,
            }),
          ]),
        }}
      />,
    );

    expect(screen.getByText(/Verified vehicle purchase/)).toBeInTheDocument();
    expect(screen.queryByText(/Official job listing: Driver/)).not.toBeInTheDocument();
  });

  it("shows the actual category evidence in the score breakdown", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...intelligence([]),
          breakdown: [{
            key: "decision_maker_match",
            label: "Decision-Maker Match",
            points: 5,
            maxPoints: 10,
            explanation: "Office Manager has possible influence but unclear fleet ownership.",
            evidence: ["Contact role: Office Manager."],
          }],
        }}
      />,
    );

    expect(screen.getByText("5 / 10 pts")).toBeInTheDocument();
    expect(screen.getByText("Office Manager has possible influence but unclear fleet ownership.")).toBeInTheDocument();
    expect(screen.getByText("Contact role: Office Manager.")).toBeInTheDocument();
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