import { describe, expect, it } from "vitest";
import {
  buildOpportunityIntelligence,
  deriveOpportunityForPersistence,
  opportunityEmailContext,
} from "./opportunityIntelligence";
import { deduplicateJobListings, extractOfficialResearchSignals, isBlockedResearchAddress } from "./officialWebsiteResearch";

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
  it("blocks private and reserved targets in hexadecimal IPv4-mapped IPv6 form", () => {
    expect(isBlockedResearchAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedResearchAddress("::ffff:a9fe:a9fe")).toBe(true);
    expect(isBlockedResearchAddress("::ffff:192.168.1.5")).toBe(true);
    expect(isBlockedResearchAddress("2001:db8::1")).toBe(true);
    expect(isBlockedResearchAddress("2606:4700:4700::1111")).toBe(false);
  });
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

  it("uses Google Places facts for validation and scoring but never as Why Target copy", () => {
    const medicalLead = {
      ...lead,
      companyName: "CornerStone Medical",
      industry: "Healthcare",
      city: "Irving",
      state: "TX",
      address: "500 Health Way, Irving, TX",
      website: "https://cornerstone.example",
    };
    const intelligence = buildOpportunityIntelligence(medicalLead, "it_services", readySeller);
    const companyFit = intelligence.breakdown.find(item => item.key === "company_industry_fit");

    expect(companyFit?.points).toBeGreaterThan(0);
    expect(intelligence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "business_listing", sourceName: "Google Places" }),
      expect.objectContaining({ signalType: "operating_address", sourceName: "Google Places" }),
      expect.objectContaining({ signalType: "company_website", sourceName: "Google Places" }),
    ]));
    expect(intelligence.whyTarget).not.toMatch(/Google Places/i);
    expect(intelligence.whyTarget).not.toMatch(/public operating address/i);
    expect(intelligence.whyTarget).not.toMatch(/public (?:company )?website/i);
    expect(intelligence.whyTarget).not.toContain("Irving, TX");
    expect(intelligence.whyTarget).toMatch(/Potential fit to validate/i);
  });

  it("builds Why Target from the strongest positive buying signal and seller fit", () => {
    const researched = [{
      signalType: "hiring_listing",
      signalTitle: "Official job listing: IT Manager",
      signalDescription: "CornerStone Medical lists an IT Manager.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company careers page",
      sourceURL: "https://cornerstone.example/careers/it-support",
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Structured JobPosting data names the role.",
      points: 0,
    }] as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "CornerStone Medical", industry: "Healthcare" },
      "it_services",
      readySeller,
      researched,
    );

    expect(intelligence.whyTarget).toContain("Official job listing: IT Manager");
    expect(intelligence.whyTarget).toMatch(/may indicate/i);
    expect(intelligence.whyTarget).toContain("Northstar Graphics");
    expect(intelligence.whyTarget).not.toMatch(/Google Places|public operating address|public (?:company )?website/i);
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

  it("recomputes a client-supplied snapshot before persistence", async () => {
    const derived = await deriveOpportunityForPersistence({
      ...lead,
      title: "Operations Director",
      opportunityIntelligence: { score: 100, breakdown: [] },
    }, "fleet_wraps", readySeller);

    expect(derived).toBeDefined();
    expect(derived?.score).not.toBe(100);
    expect(derived?.score).toBe(derived?.breakdown.reduce((sum, item) => sum + item.points, 0));
    expect(derived?.breakdown.reduce((sum, item) => sum + item.maxPoints, 0)).toBe(100);
  });

  it("keeps legacy and manual prospects nullable", async () => {
    expect(await deriveOpportunityForPersistence(lead, "fleet_wraps", readySeller)).toBeUndefined();
  });

  it("awards bounded buying points for relevant official hiring", () => {
    const researched = [{
      signalType: "hiring_listing",
      signalTitle: "Official job listing: Field Service Technician",
      signalDescription: "Northwind Mechanical lists Field Service Technician in Dallas.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company careers page",
      sourceURL: "https://northwind.example/careers/field-tech",
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Structured JobPosting data names the role.",
      points: 0,
    }] as any;
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, researched);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBeGreaterThan(0);
    expect(intelligence.breakdown.find(item => item.key === "signal_freshness")?.points).toBeGreaterThan(0);
    expect(intelligence.scoreConfidence).toBe("medium");
  });

  it("does not award buying points for irrelevant hiring", () => {
    const researched = [{
      signalType: "hiring_listing",
      signalTitle: "Official job listing: Office Administrator",
      signalDescription: "Northwind Mechanical lists an Office Administrator.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company careers page",
      sourceURL: "https://northwind.example/jobs/admin",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Structured JobPosting data names the role.",
      points: 0,
    }] as any;
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, researched);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(0);
    expect(intelligence.breakdown.find(item => item.key === "signal_freshness")?.points).toBe(0);
  });

  it("keeps field hiring as an implication and never a fleet-purchase fact", () => {
    const researched = [{
      signalType: "hiring_listing", signalTitle: "Official job listing: HVAC Technician",
      signalDescription: "Northwind Mechanical lists HVAC Technician.", signalClassification: "verified",
      confidenceLevel: "high", freshness: "unknown", sourceName: "Official careers",
      sourceURL: "https://northwind.example/jobs/hvac", dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Current official listing.", points: 0,
    }] as any;
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, researched);
    const implication = intelligence.signals.find(signal => signal.signalType === "hiring_implication");
    expect(implication?.signalClassification).toBe("implication");
    expect(implication?.signalDescription).toContain("does not verify any vehicle purchase or fleet growth");
    expect(intelligence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalTitle: "Vehicle purchase or expansion plans", signalClassification: "unconfirmed" }),
    ]));
  });

  it("scores sourced acquisition and rebrand evidence but not stale or unknown freshness", () => {
    const events = ["acquisition", "rebrand"].map((signalType, index) => ({
      signalType, signalTitle: signalType, signalDescription: `Official ${signalType} announcement`,
      signalClassification: "verified", confidenceLevel: "high",
      freshness: index ? "unknown" : "stale", sourceName: "Official company announcement",
      sourceURL: `https://northwind.example/news/${signalType}`, sourceDate: index ? undefined : "2020-01-01",
      dateDiscovered: new Date().toISOString(), supportingEvidence: `Northwind official ${signalType} wording`, points: 0,
    })) as any;
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, events);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(11);
    expect(intelligence.breakdown.find(item => item.key === "signal_freshness")?.points).toBe(0);
  });

  it("deduplicates official job listings by identifiers, URLs, or role/location/date", () => {
    expect(deduplicateJobListings([
      { title: "Technician", location: "Dallas", id: "job-1", url: "https://example.com/a" },
      { title: "Technician", location: "Dallas", id: "job-1", url: "https://example.com/b" },
      { title: "Installer", location: "Fort Worth", date: "2026-01-01" },
      { title: " installer ", location: "Fort Worth", date: "2026-01-01" },
    ])).toHaveLength(2);
  });

  it("accepts live structured jobs but rejects expired ATS JobPosting data", () => {
    const signals = extractOfficialResearchSignals("Northwind Mechanical", [{
      url: new URL("https://jobs.lever.co/northwind/role"),
      html: `<script type="application/ld+json">[
        {"@type":"JobPosting","title":"Field Service Technician","validThrough":"2099-01-01","url":"https://jobs.lever.co/northwind/role"},
        {"@type":"JobPosting","title":"Expired Driver","validThrough":"2020-01-01","url":"https://jobs.lever.co/northwind/old"}
      ]</script>`,
    }], new Date().toISOString());
    expect(signals.filter(signal => signal.signalType === "hiring_listing")).toEqual([
      expect.objectContaining({ signalTitle: "Official job listing: Field Service Technician" }),
    ]);
  });

  it("does not treat a bare job anchor as an active listing without a fetched role and Apply action", () => {
    const signals = extractOfficialResearchSignals("Northwind Mechanical", [{
      url: new URL("https://northwind.example/careers"),
      html: `<a href="/jobs/technician">Service Technician</a>`,
    }], new Date().toISOString());
    expect(signals.some(signal => signal.signalType === "hiring_listing")).toBe(false);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "hiring_research_status", signalClassification: "unconfirmed" }),
    ]));
  });

  it("requires a date bound to the announcement instead of borrowing an unrelated page date", () => {
    const signals = extractOfficialResearchSignals("Northwind Mechanical", [{
      url: new URL("https://northwind.example/about"),
      html: `<p>January 5, 2026 was our annual safety day.</p><p>Northwind Mechanical acquired Southwind Services.</p>`,
    }], new Date().toISOString());
    expect(signals.some(signal => signal.signalType === "acquisition")).toBe(false);
  });

  it("uses article publication metadata for multiple official announcement types", () => {
    const signals = extractOfficialResearchSignals("Northwind Mechanical", [{
      url: new URL("https://northwind.example/news/company-update"),
      html: `<meta property="article:published_time" content="2026-08-12T09:00:00Z">
        <p>Northwind Mechanical acquired Southwind Services.</p>
        <p>We rebranded our commercial division.</p>`,
    }], new Date().toISOString());
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "acquisition", sourceDate: "2026-08-12T09:00:00Z" }),
      expect.objectContaining({ signalType: "rebrand", sourceDate: "2026-08-12T09:00:00Z" }),
    ]));
  });

  it("keeps an undated fetched role page at medium confidence", () => {
    const signals = extractOfficialResearchSignals("Northwind Mechanical", [{
      url: new URL("https://jobs.lever.co/northwind/field-tech"),
      html: `<h1>Field Service Technician</h1><button>Apply now</button>`,
    }], new Date().toISOString());
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "hiring_listing", confidenceLevel: "medium", freshness: "unknown" }),
    ]));
  });

  it("ignores client-injected researched signals during persistence recomputation", async () => {
    const derived = await deriveOpportunityForPersistence({
      ...lead,
      title: "Operations Director",
      opportunityIntelligence: {
        signals: [{ signalType: "fleet_vehicle_evidence", points: 30 }],
        score: 100,
      },
    }, "fleet_wraps", readySeller);
    expect(derived?.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(0);
  });
});