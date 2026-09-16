import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OpportunityIntelligenceView } from "../opportunity-intelligence-view";
import type { OpportunityIntelligence } from "@workspace/api-client-react";

const mockLegacyITIntelligence: OpportunityIntelligence = {
  version: 3,
  score: 85,
  label: "Strong Fit",
  scoreConfidence: "high",
  definition: "Test definition",
  breakdown: [
    {
      key: "company_industry_fit",
      label: "Company Industry Fit",
      points: 10,
      maxPoints: 10,
      explanation: "Good fit",
      evidence: [],
    }
  ],
  signals: [],
  whyTarget: "Generic why target text",
  potentialNeeds: [],
  recommendedOutreach: "Generic outreach",
  generatedAt: "2024-01-01T00:00:00.000Z",
};

const mockITResearchIntelligence: OpportunityIntelligence = {
  ...mockLegacyITIntelligence,
  itResearch: {
    selectedIndustry: "Healthcare",
    actualIndustry: "Retail Clinic",
    industryRelationship: "mismatch",
    industryExplanation: "They serve retail customers rather than traditional healthcare.",
    lastResearched: "2024-01-01T00:00:00.000Z",
    warnings: ["Website unavailable, used third-party sources"],
    industryChallenges: [
      {
        title: "Compliance Risk",
        explanation: "New HIPAA rules",
        businessImpact: "High fines",
        sources: [
          { title: "HIPAA Guide", url: "https://example.com/hipaa", publishedDate: "2023-12-01T00:00:00.000Z" }
        ]
      }
    ],
    prospectConcerns: [
      {
        id: "concern-1",
        title: "Outdated legacy system",
        explanation: "Still using old on-prem servers",
        businessImpact: "Slow response times",
        evidence: "Job posting for legacy migration specialist",
        classification: "Verified",
        confidence: "high",
        sources: []
      }
    ],
    recommendations: [
      {
        concernId: "concern-1",
        prospectConcern: "Outdated legacy system",
        offering: "Cloud Migration Service",
        howItHelps: "Moves servers to the cloud",
        businessValue: "Reduces downtime by 99%",
        outreachAngle: "Ask about their recent job posting",
        discoveryQuestion: "How are your on-prem servers handling the load?"
      }
    ]
  }
};

describe("OpportunityIntelligenceView", () => {
  it("renders legacy IT snapshot with Refresh prompt", () => {
    const onRefresh = vi.fn();
    render(
      <OpportunityIntelligenceView
        intelligence={mockLegacyITIntelligence}
        vertical="it_services"
        onRefresh={onRefresh}
      />
    );
    
    // Should render Score Breakdown
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    
    // Should render the Refresh prompt
    expect(screen.getByText("Research Update Available")).toBeInTheDocument();
    
    // Clicking refresh should call onRefresh
    const button = screen.getByRole("button", { name: /Refresh Intelligence/i });
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("renders a generic legacy refresh prompt for non-IT sellers", () => {
    const onRefresh = vi.fn();
    render(
      <OpportunityIntelligenceView
        intelligence={mockLegacyITIntelligence}
        vertical="janitorial"
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText("Research Update Available")).toBeInTheDocument();
    expect(screen.getByText(/current industry challenges, prospect concerns/i)).toBeInTheDocument();
    expect(screen.queryByText(/specific IT challenges/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("legacy-seller-sources-guidance")).toHaveTextContent(
      "Refresh Intelligence to verify seller sources",
    );
    fireEvent.click(screen.getByRole("button", { name: /Refresh Intelligence/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("renders ITResearch sections", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={mockITResearchIntelligence}
        vertical="it_services"
      />
    );
    
    // Render score breakdown
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    
    // Render Warnings
    expect(screen.getByText("Research Warnings")).toBeInTheDocument();
    expect(screen.getByText("Website unavailable, used third-party sources")).toBeInTheDocument();
    
    // Render Mismatch
    expect(screen.getByText("Industry Mismatch: Retail Clinic")).toBeInTheDocument();
    expect(screen.getByText("They serve retail customers rather than traditional healthcare.")).toBeInTheDocument();
    
    // Render 3 sections
    expect(screen.getByText("Industry IT Challenges")).toBeInTheDocument();
    expect(screen.getByText("Prospect IT Concerns")).toBeInTheDocument();
    expect(screen.getByText("Outreach")).toBeInTheDocument();
    
    // Check specific fields
    expect(screen.getByText("Compliance Risk")).toBeInTheDocument();
    expect(screen.getByText("New HIPAA rules")).toBeInTheDocument();
    expect(screen.getByText("High fines")).toBeInTheDocument();
    
    // Sources and links
    const sourceLink = screen.getByRole("link", { name: /HIPAA Guide/i });
    expect(sourceLink).toHaveAttribute("href", "https://example.com/hipaa");
    
    // Badges
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("high confidence")).toBeInTheDocument();
    
    // Recommendation
    expect(screen.getByText("Product or service: Cloud Migration Service")).toBeInTheDocument();
    expect(screen.getByText("Prospect concern")).toBeInTheDocument();
    expect(screen.getByText("How it helps")).toBeInTheDocument();
    expect(screen.getByText("Business value")).toBeInTheDocument();
    expect(screen.getByText("Refresh Intelligence to verify seller sources")).toBeInTheDocument();
    expect(screen.queryByText("Outreach Angle")).not.toBeInTheDocument();
    expect(screen.queryByText("Discovery Question")).not.toBeInTheDocument();
  });

  it("renders header refresh button for IT Research when onRefresh is provided", () => {
    const onRefresh = vi.fn();
    render(
      <OpportunityIntelligenceView
        intelligence={mockITResearchIntelligence}
        vertical="it_services"
        onRefresh={onRefresh}
        isRefreshing={true}
      />
    );
    
    // Should show "Refreshing..." text
    expect(screen.getByRole("button", { name: /Refreshing\.\.\./i })).toBeDisabled();
  });

  it("uses generic report headings when legacy itResearch is attached to a non-IT seller", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={mockITResearchIntelligence}
        vertical="janitorial"
      />,
    );

    expect(screen.getByText("Industry Challenges")).toBeInTheDocument();
    expect(screen.getByText("Prospect Concerns")).toBeInTheDocument();
    expect(screen.queryByText("Industry IT Challenges")).not.toBeInTheDocument();
    expect(screen.queryByText("Prospect IT Concerns")).not.toBeInTheDocument();
  });

  it("keeps the solutions section visible with honest empty-state guidance", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...mockITResearchIntelligence,
          itResearch: {
            ...mockITResearchIntelligence.itResearch!,
            recommendations: [],
          },
        }}
        vertical="it_services"
      />,
    );

    expect(screen.getByText("Industry IT Challenges")).toBeInTheDocument();
    expect(screen.getByText("Prospect IT Concerns")).toBeInTheDocument();
    expect(screen.getByText("Outreach")).toBeInTheDocument();
    expect(screen.getByTestId("empty-recommended-solutions")).toHaveTextContent(
      "No supported matching offering found",
    );
    expect(screen.getByTestId("empty-recommended-solutions")).toHaveTextContent(
      "Refresh Intelligence to verify seller sources",
    );
  });

  it("keeps all three research sections visible when the report has no findings", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...mockITResearchIntelligence,
          itResearch: {
            ...mockITResearchIntelligence.itResearch!,
            industryChallenges: [],
            prospectConcerns: [],
            recommendations: [],
          },
        }}
        vertical="it_services"
      />,
    );

    expect(screen.getByText("Industry IT Challenges")).toBeInTheDocument();
    expect(screen.getByText("No industry challenges identified in this report.")).toBeInTheDocument();
    expect(screen.getByText("Prospect IT Concerns")).toBeInTheDocument();
    expect(screen.getByText("No prospect concerns identified in this report.")).toBeInTheDocument();
    expect(screen.getByText("Outreach")).toBeInTheDocument();
    expect(screen.getByTestId("empty-recommended-solutions")).toBeInTheDocument();
  });

  it("renders internet-verified seller sources for each offering", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...mockITResearchIntelligence,
          itResearch: {
            ...mockITResearchIntelligence.itResearch!,
            sellerCompanyName: "Northstar Graphics",
            recommendations: [{
              ...mockITResearchIntelligence.itResearch!.recommendations[0],
              sellerEvidence: {
                availability: "source_backed",
                basis: "The offering is listed in the seller's current service profile.",
                sources: [{
                  title: "Northstar Graphics Services",
                  url: "https://example.com/services",
                  publishedDate: "2024-01-02T00:00:00.000Z",
                }],
              },
            }],
          },
        }}
        vertical="it_services"
      />,
    );

    expect(screen.getByText("Products and services from Northstar Graphics that could address this prospect’s concerns.")).toBeInTheDocument();
    expect(screen.getByText("Seller sources")).toBeInTheDocument();
    expect(screen.getByText("Internet sources verified for this offering.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Northstar Graphics Services/i })).toHaveAttribute(
      "href",
      "https://example.com/services",
    );
    expect(screen.getByText("The offering is listed in the seller's current service profile.")).toBeInTheDocument();
  });

  it("labels approved manual seller sources as user-confirmed rather than internet evidence", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={{
          ...mockITResearchIntelligence,
          itResearch: {
            ...mockITResearchIntelligence.itResearch!,
            recommendations: [{
              ...mockITResearchIntelligence.itResearch!.recommendations[0],
              sellerEvidence: {
                availability: "user_approved",
                sources: [{
                  title: "Approved service catalog",
                  url: "https://example.com/catalog",
                }],
              },
            }],
          },
        }}
        vertical="it_services"
      />,
    );

    expect(screen.getByText("User-confirmed sources (not internet-verified).")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Approved service catalog/i })).toHaveAttribute(
      "href",
      "https://example.com/catalog",
    );
    expect(screen.queryByText("Internet sources verified for this offering.")).not.toBeInTheDocument();
  });

  it("shows source refresh guidance for an older structured recommendation without seller evidence", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={mockITResearchIntelligence}
        vertical="it_services"
      />,
    );

    expect(screen.getByText("Refresh Intelligence to verify seller sources")).toBeInTheDocument();
    expect(screen.queryByText("Internet sources verified for this offering.")).not.toBeInTheDocument();
  });

  it("keeps the compact solution summary and omits outreach scripting fields", () => {
    render(
      <OpportunityIntelligenceView
        intelligence={mockITResearchIntelligence}
        vertical="it_services"
        compact
      />,
    );

    expect(screen.getByText("Product or service:")).toBeInTheDocument();
    expect(screen.getByText(/Cloud Migration Service — Moves servers to the cloud/)).toBeInTheDocument();
    expect(screen.queryByText("Ask about their recent job posting")).not.toBeInTheDocument();
    expect(screen.queryByText("How are your on-prem servers handling the load?")).not.toBeInTheDocument();
  });
});
