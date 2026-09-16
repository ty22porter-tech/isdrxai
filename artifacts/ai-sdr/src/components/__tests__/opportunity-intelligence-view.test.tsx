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
    expect(screen.getByText("Recommended Solutions and Outreach")).toBeInTheDocument();
    
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
    expect(screen.getByText("Solution: Cloud Migration Service")).toBeInTheDocument();
    expect(screen.getByText('"How are your on-prem servers handling the load?"')).toBeInTheDocument();
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
});
