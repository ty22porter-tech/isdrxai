import { describe, expect, it } from "vitest";
import {
  buildOpportunityIntelligence,
  deriveOpportunityForPersistence,
  opportunityEmailContext,
} from "./opportunityIntelligence";

const lead = {
  companyName: "Northwind Mechanical",
  contactTitle: "Decision maker (pending enrichment)",
  industry: "HVAC",
  city: "Dallas",
  state: "TX",
  address: "100 Main St, Dallas, TX",
  website: "northwind.example",
  phone: "(214) 555-0100",
};

const readySeller = {
  sellerServicePriorities: "fleet lettering",
  sellerIntelligenceProfile: {
    status: "ready",
    websiteAnalysisStatus: "ready",
    sellerCompanyName: "Northstar Graphics",
    sellerServices: ["fleet lettering"],
    sellerProducts: [],
    sellerCapabilities: ["on-site installation"],
    sellerDifferentiators: ["certified installers"],
    sellerCertifications: [],
    sellerIndustriesServed: ["HVAC"],
    sellerBusinessOutcomes: ["consistent field branding"],
    sellerProblemsSolved: [],
    sellerProofPoints: [],
    sellerPortfolioExamples: [],
    sellerValuePropositions: [],
    sellerCTAs: ["compare your current vehicle graphics"],
  },
} as any;

describe("opportunity intelligence", () => {
  it("uses an exact 100-point category model and sums the earned total", () => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);

    expect(intelligence.breakdown).toHaveLength(6);
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.maxPoints, 0)).toBe(100);
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.points, 0)).toBe(intelligence.score);
  });

  it("does not award buying-signal or freshness points without dated buying evidence", () => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    const buyingSignals = intelligence.breakdown.find(item => item.key === "verified_buying_signals");
    const freshness = intelligence.breakdown.find(item => item.key === "signal_freshness");

    expect(buyingSignals?.points).toBe(0);
    expect(freshness?.points).toBe(0);
    expect(intelligence.signals.filter(signal => signal.signalClassification === "unconfirmed"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ points: 0 })]));
  });

  it("changes seller-match points when approved seller intelligence changes", () => {
    const ready = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    const limited = buildOpportunityIntelligence(lead, "fleet_wraps", undefined);
    const readyMatch = ready.breakdown.find(item => item.key === "seller_prospect_match");
    const limitedMatch = limited.breakdown.find(item => item.key === "seller_prospect_match");

    expect(readyMatch?.points).toBeGreaterThan(limitedMatch?.points ?? 0);
    expect(ready.score).toBeGreaterThan(limited.score);
  });

  it("keeps verified facts, implications, and unknowns separated for email prompts", () => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    const context = opportunityEmailContext(intelligence);

    expect(context).toContain("VERIFIED FACTS");
    expect(context).toContain("POTENTIAL IMPLICATIONS");
    expect(context).toContain("UNCONFIRMED");
    expect(context).toContain("Current fleet size");
  });

  it("recomputes a client-supplied snapshot before persistence", () => {
    const derived = deriveOpportunityForPersistence({
      ...lead,
      title: "Operations Director",
      opportunityIntelligence: { score: 100, breakdown: [] },
    }, "fleet_wraps", readySeller);

    expect(derived).toBeDefined();
    expect(derived?.score).not.toBe(100);
    expect(derived?.score).toBe(derived?.breakdown.reduce((sum, item) => sum + item.points, 0));
    expect(derived?.breakdown.reduce((sum, item) => sum + item.maxPoints, 0)).toBe(100);
  });

  it("keeps legacy and manual prospects nullable", () => {
    expect(deriveOpportunityForPersistence(lead, "fleet_wraps", readySeller)).toBeUndefined();
  });
});