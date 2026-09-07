import { describe, expect, it } from "vitest";
import {
  buildOpportunityIntelligence,
  deriveOpportunityForPersistence,
  opportunityEmailContext,
  refreshStoredOpportunityForRead,
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
    expect(intelligence.breakdown.map(item => item.maxPoints)).toEqual([20, 30, 20, 10, 10, 10]);
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.maxPoints, 0)).toBe(100);
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.points, 0)).toBe(intelligence.score);
  });

  it("calculates the required fleet prospect scenarios from actual evidence", () => {
    const now = new Date().toISOString();
    const model = {
      signalType: "business_model_evidence",
      signalTitle: "Verified vehicle-centered operating model",
      signalDescription: "Northwind's official website describes a field-service operation using commercial vehicles.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "unknown",
      sourceName: "Official company website",
      sourceURL: "https://northwind.example/about",
      dateDiscovered: now,
      supportingEvidence: "Field technicians travel to customer sites in company service vehicles.",
      points: 0,
    } as any;
    const event = (signalType: string, title: string, description: string, path: string) => ({
      signalType,
      signalTitle: title,
      signalDescription: description,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company announcement",
      sourceURL: `https://northwind.example/news/${path}`,
      sourceDate: now,
      dateDiscovered: now,
      supportingEvidence: description,
      points: 0,
    }) as any;
    const strongFleetLead = { ...lead, contactTitle: "Operations Manager" };

    const noFleetRelevance = buildOpportunityIntelligence(
      { ...lead, companyName: "Corner Bookshop", industry: "Book store", contactTitle: null },
      "fleet_wraps",
      readySeller,
    );
    const fleetNoSignals = buildOpportunityIntelligence(strongFleetLead, "fleet_wraps", readySeller, [model]);
    const fleetWithHiring = buildOpportunityIntelligence(strongFleetLead, "fleet_wraps", readySeller, [
      model,
      event(
        "hiring_listing",
        "Official job listing: 8 Service Technician openings",
        "Northwind lists 8 current Service Technician openings.",
        "service-technicians",
      ),
    ]);
    const fleetWithPurchase = buildOpportunityIntelligence(strongFleetLead, "fleet_wraps", readySeller, [
      model,
      event("vehicle_purchase", "Verified vehicle purchase", "Northwind purchased 12 new service vans.", "vehicle-purchase"),
    ]);
    const fleetWithGrowth = buildOpportunityIntelligence(strongFleetLead, "fleet_wraps", readySeller, [
      model,
      event("rebrand", "Verified rebrand", "Northwind announced a company-wide rebrand.", "rebrand"),
      event("expansion", "Verified expansion", "Northwind announced expansion into two new markets.", "expansion"),
    ]);
    const googleOnly = buildOpportunityIntelligence(
      { ...lead, industry: "Local business", contactTitle: null },
      "fleet_wraps",
      readySeller,
    );
    const points = (value: ReturnType<typeof buildOpportunityIntelligence>, key: string) =>
      value.breakdown.find(item => item.key === key)?.points;

    expect(noFleetRelevance.label).toBe("Low Priority");
    expect(noFleetRelevance.score).toBeLessThan(40);

    expect(points(fleetNoSignals, "company_industry_fit")).toBe(20);
    expect(points(fleetNoSignals, "verified_buying_signals")).toBe(0);
    expect(points(fleetNoSignals, "signal_freshness")).toBe(0);
    expect(fleetNoSignals.score).toBe(58);
    expect(fleetNoSignals.label).toBe("Moderate Opportunity");

    expect(points(fleetWithHiring, "verified_buying_signals")).toBe(8);
    expect(points(fleetWithHiring, "signal_freshness")).toBe(10);
    expect(fleetWithHiring.score).toBe(76);
    expect(fleetWithHiring.label).toBe("Strong Opportunity");

    expect(points(fleetWithPurchase, "verified_buying_signals")).toBe(14);
    expect(fleetWithPurchase.score).toBe(82);

    expect(points(fleetWithGrowth, "verified_buying_signals")).toBe(17);
    expect(fleetWithGrowth.score).toBe(85);
    expect(fleetWithGrowth.label).toBe("High Priority");

    expect(points(googleOnly, "verified_buying_signals")).toBe(0);
    expect(points(googleOnly, "signal_freshness")).toBe(0);
    expect(googleOnly.score).toBeLessThan(40);
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

  it("explains seller-specific sales relevance instead of repeating company verification", () => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);

    expect(intelligence.whyTarget).toContain("selected HVAC category suggests");
    expect(intelligence.whyTarget).toContain("not been verified");
    expect(intelligence.whyTarget).toContain("Northstar Graphics");
    expect(intelligence.whyTarget).toContain("fleet lettering");
    expect(intelligence.whyTarget).toContain("No current fleet expansion");
    expect(intelligence.whyTarget).not.toMatch(/Google Places|public operating address|public website|published business phone/i);
  });

  it("uses verified official-site operating-model evidence for why target", () => {
    const vonlane = {
      ...lead,
      companyName: "Vonlane",
      industry: "Local business",
      website: "vonlane.example",
    };
    const researched = extractOfficialResearchSignals("Vonlane", [{
      url: new URL("https://vonlane.example/about"),
      html: "<p>Vonlane provides premium intercity bus service with scheduled routes across Texas.</p>",
    }], new Date().toISOString());
    const intelligence = buildOpportunityIntelligence(vonlane, "fleet_wraps", readySeller, researched);

    expect(researched).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalType: "business_model_evidence",
        signalClassification: "verified",
        points: 0,
      }),
    ]));
    expect(intelligence.whyTarget).toContain("customer-facing passenger transportation service");
    expect(intelligence.whyTarget).toContain("Northstar Graphics");
    expect(intelligence.whyTarget).toContain("No current fleet expansion");
    expect(intelligence.whyTarget).not.toContain("Google Places");
  });

  it("leads why target with a verified timely signal before model and seller fit", () => {
    const researched = [{
      signalType: "new_route",
      signalTitle: "Verified new route",
      signalDescription: "Vonlane announced a new Houston-to-Austin route.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company announcement",
      sourceURL: "https://vonlane.example/news/new-route",
      sourceDate: "2026-08-20",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Official dated announcement.",
      points: 0,
    }] as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "Vonlane", industry: "Passenger transportation" },
      "fleet_wraps",
      readySeller,
      researched,
    );

    expect(intelligence.whyTarget.startsWith("Vonlane announced a new Houston-to-Austin route.")).toBe(true);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBeGreaterThan(0);
  });

  it("leads with a stronger vehicle purchase instead of the first hiring result", () => {
    const researched = [
      {
        signalType: "hiring_listing",
        signalTitle: "Official job listing: Driver",
        signalDescription: "Vonlane lists a Driver role in Houston.",
        signalClassification: "verified",
        confidenceLevel: "high",
        freshness: "recent",
        sourceName: "Official careers page",
        sourceURL: "https://vonlane.example/jobs/driver",
        sourceDate: "2026-08-20",
        dateDiscovered: new Date().toISOString(),
        supportingEvidence: "Current official role.",
        points: 0,
      },
      {
        signalType: "vehicle_purchase",
        signalTitle: "Verified vehicle purchase",
        signalDescription: "Vonlane purchased 12 new motorcoaches.",
        signalClassification: "verified",
        confidenceLevel: "high",
        freshness: "recent",
        sourceName: "Official company announcement",
        sourceURL: "https://vonlane.example/news/fleet",
        sourceDate: "2026-08-20",
        dateDiscovered: new Date().toISOString(),
        supportingEvidence: "Official dated purchase announcement.",
        points: 0,
      },
    ] as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "Vonlane", industry: "Passenger transportation" },
      "fleet_wraps",
      readySeller,
      researched,
    );

    expect(intelligence.whyTarget.startsWith("Vonlane purchased 12 new motorcoaches.")).toBe(true);
    expect(intelligence.recommendedOutreach).toContain("verified vehicle purchase");
  });

  it("does not describe stale or undated verified events as timely", () => {
    const baseSignal = {
      signalClassification: "verified",
      confidenceLevel: "high",
      sourceName: "Official company announcement",
      sourceURL: "https://northwind.example/news/event",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Official company statement.",
      points: 0,
    };
    const stale = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, [{
      ...baseSignal,
      signalType: "acquisition",
      signalTitle: "Verified acquisition",
      signalDescription: "Northwind acquired an installer in 2020.",
      freshness: "stale",
      sourceDate: "2020-01-01",
    }] as any);
    const undated = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, [{
      ...baseSignal,
      signalType: "rebrand",
      signalTitle: "Verified rebrand",
      signalDescription: "Northwind announced a rebrand.",
      freshness: "unknown",
    }] as any);

    expect(stale.whyTarget).toContain("verified historical context, not a current buying signal");
    expect(stale.whyTarget).not.toMatch(/timely reason/i);
    expect(undated.whyTarget).toContain("date is not");
    expect(undated.whyTarget).not.toMatch(/timely reason/i);
  });

  it("allows a weak-fit prospect to have no strong reason to prioritize", () => {
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "Corner Bookshop", industry: "Book store" },
      "fleet_wraps",
      readySeller,
    );

    expect(intelligence.label).toBe("Low Priority");
    expect(intelligence.whyTarget).toContain("No strong seller-specific reason to prioritize Corner Bookshop");
  });

  it("keeps identity and contactability from materially raising the opportunity score", () => {
    const sparse = buildOpportunityIntelligence(
      { ...lead, address: null, website: null, phone: null },
      "fleet_wraps",
      readySeller,
    );
    const contactable = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    const sparseFit = sparse.breakdown.find(item => item.key === "company_industry_fit")?.points ?? 0;
    const contactableFit = contactable.breakdown.find(item => item.key === "company_industry_fit")?.points ?? 0;

    expect(contactableFit - sparseFit).toBe(0);
    expect(contactable.score - sparse.score).toBe(0);
  });

  it("scores fleet decision-makers by role relevance instead of contact existence", () => {
    const officeManager = buildOpportunityIntelligence(
      { ...lead, contactTitle: "Office Manager" },
      "fleet_wraps",
      readySeller,
    );
    const fleetManager = buildOpportunityIntelligence(
      { ...lead, contactTitle: "Director of Fleet" },
      "fleet_wraps",
      readySeller,
    );

    expect(officeManager.breakdown.find(item => item.key === "decision_maker_match")?.points).toBe(5);
    expect(fleetManager.breakdown.find(item => item.key === "decision_maker_match")?.points).toBe(10);
    expect(fleetManager.score - officeManager.score).toBe(5);
  });

  it.each([
    "Fleet Manager",
    "Chauffeur",
    "Fleet Mechanic",
    "Field Sales Representative",
  ])("scores requested mobile hiring role %s", (role) => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, [{
      signalType: "hiring_listing",
      signalTitle: `Official job listing: ${role}`,
      signalDescription: `Northwind Mechanical lists ${role}.`,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company careers page",
      sourceURL: `https://northwind.example/jobs/${role.toLowerCase().replace(/\s+/g, "-")}`,
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: `Current official ${role} listing.`,
      points: 0,
    }] as any);

    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBeGreaterThan(0);
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

  it("repairs a saved version-1 fleet score before it is returned", () => {
    const oldSnapshot = {
      ...buildOpportunityIntelligence(lead, "fleet_wraps", readySeller),
      version: 1,
      score: 43,
      label: "Possible Fit",
      whyTarget: "Verified: returned by Google Places with a public website.",
    } as any;
    const refreshed = refreshStoredOpportunityForRead({
      ...lead,
      title: "Office Manager",
      vertical: "fleet_wraps",
      opportunityIntelligence: oldSnapshot,
    }, readySeller);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.intelligence?.version).toBe(2);
    expect(refreshed.intelligence?.score).not.toBe(43);
    expect(refreshed.intelligence?.whyTarget).not.toMatch(/Google Places|public website/i);
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
    expect(intelligence.whyTarget).toContain("Northwind Mechanical lists HVAC Technician");
    expect(intelligence.whyTarget).toContain("does not verify a purchase, expansion, or provider change");
  });

  it("gives stale and undated events limited buying weight and only source-age freshness", () => {
    const events = ["acquisition", "rebrand"].map((signalType, index) => ({
      signalType, signalTitle: signalType, signalDescription: `Official ${signalType} announcement`,
      signalClassification: "verified", confidenceLevel: "high",
      freshness: index ? "unknown" : "stale", sourceName: "Official company announcement",
      sourceURL: `https://northwind.example/news/${signalType}`, sourceDate: index ? undefined : "2020-01-01",
      dateDiscovered: new Date().toISOString(), supportingEvidence: `Northwind official ${signalType} wording`, points: 0,
    })) as any;
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, events);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(6);
    expect(intelligence.breakdown.find(item => item.key === "signal_freshness")?.points).toBe(1);
  });

  it("derives freshness from source age rather than trusting a supplied label", () => {
    const sourceDate = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, [{
      signalType: "vehicle_purchase",
      signalTitle: "Verified vehicle purchase",
      signalDescription: "Northwind purchased new service vans.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company announcement",
      sourceURL: "https://northwind.example/news/vans",
      sourceDate,
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Dated official vehicle-purchase announcement.",
      points: 0,
    }] as any);

    expect(intelligence.breakdown.find(item => item.key === "signal_freshness")?.points).toBe(8);
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(13);
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

  it("extracts dated route, vehicle-purchase, and facility expansion signals", () => {
    const signals = extractOfficialResearchSignals("Vonlane", [{
      url: new URL("https://vonlane.example/news/growth"),
      html: `<meta property="article:published_time" content="2026-08-12T09:00:00Z">
        <p>Vonlane announced a new Houston-to-Austin route.</p>
        <p>Vonlane purchased 12 new motorcoaches.</p>
        <p>Vonlane opened a new terminal in Houston.</p>`,
    }], new Date().toISOString());

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "new_route", sourceDate: "2026-08-12T09:00:00Z" }),
      expect.objectContaining({ signalType: "vehicle_purchase", sourceDate: "2026-08-12T09:00:00Z" }),
      expect.objectContaining({ signalType: "new_facility", sourceDate: "2026-08-12T09:00:00Z" }),
    ]));
  });

  it("does not treat an existing service-between description as a new route", () => {
    const signals = extractOfficialResearchSignals("Vonlane", [{
      url: new URL("https://vonlane.example/about"),
      html: `<meta property="article:published_time" content="2026-08-12T09:00:00Z">
        <p>Vonlane provides service between Houston and Dallas.</p>`,
    }], new Date().toISOString());

    expect(signals.some(signal => signal.signalType === "new_route")).toBe(false);
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