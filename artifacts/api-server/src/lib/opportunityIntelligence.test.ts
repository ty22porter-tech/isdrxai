import { describe, expect, it } from "vitest";
import {
  buildOpportunityIntelligence,
  deriveOpportunityForPersistence,
  opportunityEmailContext,
  upgradeStoredOpportunityIntelligence,
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
    expect(Object.fromEntries(intelligence.breakdown.map(item => [item.key, item.maxPoints]))).toEqual({
      company_industry_fit: 20,
      verified_buying_signals: 30,
      seller_prospect_match: 20,
      decision_maker_match: 10,
      signal_freshness: 10,
      business_need_potential: 10,
    });
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.maxPoints, 0)).toBe(100);
    expect(intelligence.breakdown.reduce((sum, item) => sum + item.points, 0)).toBe(intelligence.score);
  });

  it("marks an evidence-based score of 30 as a possible fit to call", () => {
    const intelligence = buildOpportunityIntelligence({
      ...lead,
      contactTitle: "IT Director",
      employeeCount: 25,
    }, "it_services", readySeller);

    expect(intelligence.score).toBe(30);
    expect(intelligence.label).toBe("Possible Fit");
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

  it("gives fleet prospects three distinct fields from individual company evidence", () => {
    const mobileCareSignal = [{
      signalType: "fleet_mobile_operations",
      signalTitle: "Official mobile-service evidence",
      signalDescription: "All About Home Care states that its caregivers provide in-home care throughout North Texas.",
      signalClassification: "verified",
      confidenceLevel: "medium",
      freshness: "unknown",
      sourceName: "Official company website",
      sourceURL: "https://allabouthomecare.example/services",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Our caregivers provide in-home care throughout North Texas.",
      points: 0,
    }] as any;
    const homeCare = buildOpportunityIntelligence({
      ...lead,
      companyName: "All About Home Care",
      industry: "Home Health Care",
    }, "fleet_wraps", readySeller, mobileCareSignal);
    const hvac = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, [{
      ...mobileCareSignal[0],
      signalDescription: "Northwind Mechanical states that technicians provide on-site HVAC repairs.",
      sourceURL: "https://northwind.example/services",
      supportingEvidence: "Our technicians provide on-site HVAC repairs.",
    }]);

    expect(homeCare.whyTarget).toContain("provide in-home care throughout North Texas");
    expect(homeCare.whyTarget).toMatch(/not fleet size or a current graphics need/i);
    expect(homeCare.potentialNeeds.join(" ")).toMatch(/documented in-home service model/i);
    expect(homeCare.potentialNeeds.join(" ")).toMatch(/fleet lettering/i);
    expect(homeCare.recommendedOutreach).toMatch(/documented in-home service model/i);
    expect(homeCare.recommendedOutreach).not.toBe(homeCare.whyTarget);
    expect(homeCare.recommendedOutreach).not.toContain(homeCare.potentialNeeds[0]);
    expect(hvac.whyTarget).toContain("on-site HVAC repairs");
    expect(hvac.whyTarget).not.toBe(homeCare.whyTarget);
  });

  it("matches fleet prospect operations to the individual client's approved solution catalog", () => {
    const c4Wraps = {
      ...readySeller,
      sellerServicePriorities: "fleet lettering, reflective fleet graphics, color-change wraps",
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "C4 Wraps",
        sellerServices: ["event banners"],
        sellerCapabilities: ["in-house design"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence({
      ...lead,
      companyName: "All About Home Care",
      industry: "Home Health Care",
    }, "fleet_wraps", c4Wraps, [{
      signalType: "fleet_mobile_operations",
      signalTitle: "Official mobile-service evidence",
      signalDescription: "All About Home Care states that its caregivers provide in-home care throughout North Texas.",
      signalClassification: "verified",
      confidenceLevel: "medium",
      freshness: "unknown",
      sourceName: "Official company website",
      sourceURL: "https://allabouthomecare.example/services",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "Our caregivers provide in-home care throughout North Texas.",
      points: 0,
    }] as any);

    expect(intelligence.potentialNeeds.join(" ")).toContain("C4 Wraps");
    expect(intelligence.potentialNeeds.join(" ")).toContain("fleet lettering");
    expect(intelligence.recommendedOutreach).toContain("C4 Wraps");
    expect(intelligence.recommendedOutreach).toContain("fleet lettering");
    expect(intelligence.recommendedOutreach).toContain("documented in-home service model");
    expect(intelligence.recommendedOutreach).not.toContain("event banners");
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
    expect(intelligence.whyTarget).toBe("");
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
    const relevantSeller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["managed IT services"],
        sellerCapabilities: ["technology support"],
        sellerBusinessOutcomes: ["reliable technology operations"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "CornerStone Medical", industry: "Healthcare" },
      "it_services",
      relevantSeller,
      researched,
    );

    expect(intelligence.whyTarget).toContain("Official job listing: IT Manager");
    expect(intelligence.whyTarget).toMatch(/may indicate/i);
    expect(intelligence.whyTarget).toContain("SecurePath IT");
    expect(intelligence.whyTarget).toContain("technology support");
    expect(intelligence.whyTarget).not.toMatch(/Google Places|public operating address|public (?:company )?website/i);
  });

  it("derives Potential Needs from verified research and connects them to an approved seller offer", () => {
    const researched = [{
      signalType: "expansion",
      signalTitle: "Official expansion announcement",
      signalDescription: "The company announced a second operating location.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company news",
      sourceURL: "https://northwind.example/news/expansion",
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "The official announcement names the new location.",
      points: 0,
    }] as any;
    const seller = {
      ...readySeller,
      sellerServicePriorities: "",
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["managed IT services"],
        sellerCapabilities: ["multi-location network integration"],
        sellerBusinessOutcomes: ["consistent and secure operations across locations"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence(lead, "it_services", seller, researched);

    expect(intelligence.potentialNeeds).toHaveLength(1);
    expect(intelligence.potentialNeeds[0]).toContain("Official expansion announcement");
    expect(intelligence.potentialNeeds[0]).toContain("integrating locations, users, systems, security controls, and support");
    expect(intelligence.potentialNeeds[0]).toContain("SecurePath IT");
    expect(intelligence.potentialNeeds[0]).toContain("multi-location network integration");
  });

  it("does not turn industry compliance into prospect intelligence without company-specific evidence", () => {
    const medicalLead = { ...lead, companyName: "CornerStone Medical", industry: "Healthcare" };
    const securitySeller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["managed IT services", "cybersecurity assessment"],
        sellerCapabilities: ["HIPAA compliance support"],
        sellerBusinessOutcomes: ["stronger security and audit readiness"],
      },
    } as any;

    const relevant = buildOpportunityIntelligence(medicalLead, "it_services", securitySeller);
    const unrelated = buildOpportunityIntelligence(medicalLead, "it_services", readySeller);

    expect(relevant.potentialNeeds).toEqual([]);
    expect(relevant.recommendedOutreach).toBe("");
    expect(unrelated.potentialNeeds).toEqual([]);
  });

  it("does not manufacture fleet narratives when research finds no company-specific signal", () => {
    const intelligence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    expect(intelligence.whyTarget).toBe("");
    expect(intelligence.potentialNeeds).toEqual([]);
    expect(intelligence.recommendedOutreach).toBe("");
  });

  it("extracts verified mobile-operation evidence from an individual company website", () => {
    const signals = extractOfficialResearchSignals("All About Home Care", [{
      url: new URL("https://allabouthomecare.example/services"),
      html: "<html><body><p>Our caregivers travel to client homes and provide in-home care throughout North Texas.</p></body></html>",
    }], "2026-09-07T12:00:00.000Z");
    const mobile = signals.find(signal => signal.signalType === "fleet_mobile_operations");

    expect(mobile).toMatchObject({
      signalClassification: "verified",
      sourceName: "Official company website",
      points: 0,
    });
    expect(mobile?.supportingEvidence).toContain("provide in-home care throughout North Texas");
  });

  it("uses official operating evidence for IT discovery without scoring it as a buying signal", () => {
    const signals = extractOfficialResearchSignals("Perfect General Contractors", [{
      url: new URL("https://perfectgc.example/services"),
      html: "<html><body><p>Our company provides commercial construction management and coordinates project teams across active job sites in North Texas.</p></body></html>",
    }], "2026-09-08T12:00:00.000Z");
    const seller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["managed IT services"],
        sellerCapabilities: ["identity, endpoint, and network support"],
        sellerBusinessOutcomes: ["reliable and secure operations"],
        sellerCTAs: ["schedule a technology operations review"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence({
      ...lead,
      companyName: "Perfect General Contractors",
      industry: "Construction",
    }, "it_services", seller, signals);

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalType: "company_operating_profile",
        signalClassification: "verified",
        points: 0,
      }),
    ]));
    expect(intelligence.breakdown.find(item => item.key === "verified_buying_signals")?.points).toBe(0);
    expect(intelligence.whyTarget).toContain("commercial construction management");
    expect(intelligence.whyTarget).toMatch(/does not prove a current IT problem or purchase intent/i);
    expect(intelligence.potentialNeeds.join(" ")).toContain("Perfect General Contractors");
    expect(intelligence.potentialNeeds.join(" ")).toContain("identity, endpoint, and network support");
    expect(intelligence.recommendedOutreach).toContain("Perfect General Contractors");
    expect(intelligence.recommendedOutreach).toContain("identity, endpoint, and network support");
  });

  it("turns a janitorial prospect's operating profile into all three research outcomes", () => {
    const janitorialSeller = {
      ...readySeller,
      sellerServicePriorities: "",
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "North Texas Facility Care",
        sellerServices: ["recurring commercial cleaning"],
        sellerCapabilities: ["high-touch disinfecting", "office and restroom cleaning"],
        sellerBusinessOutcomes: ["a consistently clean and presentable workplace"],
        sellerCTAs: ["schedule a facility walkthrough"],
      },
    } as any;
    const description = "Charlin Health Services is a Medicare Certified Home Health and Hospice Care Agency serving patients throughout the Dallas Metroplex.";
    const intelligence = buildOpportunityIntelligence({
      ...lead,
      companyName: "Charlin Health Services",
      industry: "Home Health Care",
    }, "janitorial", janitorialSeller, [{
      signalType: "company_operating_profile",
      signalTitle: "Company operating profile",
      signalDescription: description,
      signalClassification: "verified",
      confidenceLevel: "medium",
      freshness: "unknown",
      sourceName: "Company research",
      sourceURL: "https://charlin.example",
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: description,
      points: 0,
    }] as any);

    expect(intelligence.whyTarget).toContain("Charlin Health Services");
    expect(intelligence.whyTarget).toMatch(/does not prove a current cleaning-service gap or purchase intent/i);
    expect(intelligence.potentialNeeds.join(" ")).toContain("Charlin Health Services");
    expect(intelligence.potentialNeeds.join(" ")).toMatch(/offices and staff environments/i);
    expect(intelligence.potentialNeeds.join(" ")).toContain("recurring commercial cleaning");
    expect(intelligence.recommendedOutreach).toContain("Charlin Health Services");
    expect(intelligence.recommendedOutreach).toContain("recurring commercial cleaning");
    expect(intelligence.recommendedOutreach).toContain("best-matching approved Janitorial solution");
  });

  it("personalizes operating-profile outreach and selects the relevant website-approved seller offering", () => {
    const seller = {
      ...readySeller,
      sellerServicePriorities: "cloud collaboration support, backup and disaster recovery",
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "CloudScale 365",
        sellerServices: ["managed IT services"],
        sellerCapabilities: [],
        sellerBusinessOutcomes: ["reliable and secure operations"],
        sellerCTAs: ["Contact Us"],
      },
    } as any;
    const signal = (description: string, sourceURL: string) => ({
      signalType: "company_operating_profile",
      signalTitle: "Company operating profile",
      signalDescription: description,
      signalClassification: "verified",
      confidenceLevel: "medium",
      freshness: "unknown",
      sourceName: "Company research",
      sourceURL,
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: description,
      points: 0,
    });
    const construction = buildOpportunityIntelligence({
      ...lead,
      companyName: "Perfect General Contractors",
      industry: "Construction",
    }, "it_services", seller, [
      signal(
        "Perfect General Contractors manages commercial construction projects and field teams across North Texas.",
        "https://perfect.example",
      ),
    ] as any);
    const manufacturer = buildOpportunityIntelligence({
      ...lead,
      companyName: "Contoso Manufacturing",
      industry: "Manufacturing",
    }, "it_services", seller, [
      signal(
        "Contoso Manufacturing operates production plants and warehouses for industrial equipment.",
        "https://contoso.example",
      ),
    ] as any);

    expect(construction.recommendedOutreach).toContain("commercial construction projects and field teams");
    expect(construction.recommendedOutreach).toContain("cloud collaboration support");
    expect(construction.recommendedOutreach).toContain("Forte' Technologies");
    expect(construction.recommendedOutreach).toContain("approved IT Services ICP solution");
    expect(construction.recommendedOutreach).not.toContain("CloudScale 365");
    expect(manufacturer.recommendedOutreach).toContain("production plants and warehouses");
    expect(manufacturer.recommendedOutreach).toContain("backup and disaster recovery");
    expect(construction.recommendedOutreach).not.toBe(manufacturer.recommendedOutreach);
    expect(construction.recommendedOutreach).not.toMatch(/if discovery confirms a relevant challenge/i);
    expect(construction.recommendedOutreach).not.toMatch(/contact us/i);
  });

  it("does not recommend an unrelated seller offer when prospect evidence has no relevant match", () => {
    const intelligence = buildOpportunityIntelligence(lead, "it_services", readySeller);
    expect(intelligence.recommendedOutreach).not.toContain("No strong company-specific buying signal has been verified");
    expect(intelligence.recommendedOutreach).toBe("");
    expect(intelligence.breakdown.find(item => item.key === "seller_prospect_match")?.points).toBe(0);
  });

  it("keeps company size in scoring evidence without manufacturing IT outreach", () => {
    const seller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["managed IT services", "cybersecurity assessment"],
        sellerCapabilities: ["endpoint and identity management"],
        sellerBusinessOutcomes: ["more consistent and secure operations"],
        sellerCTAs: ["schedule a technology readiness review"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, industry: "Commercial", employeeCount: 84 },
      "it_services",
      seller,
    );

    expect(intelligence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalType: "company_size",
        signalDescription: expect.stringContaining("84 employees"),
      }),
    ]));
    expect(intelligence.recommendedOutreach).toBe("");
    expect(intelligence.potentialNeeds).toEqual([]);
    expect(intelligence.whyTarget).toBe("");
  });

  it("uses financial compliance only as context for a verified company security signal", () => {
    const financialLead = { ...lead, companyName: "Example Financial", industry: "Financial Services" };
    const securitySeller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["cybersecurity assessment"],
        sellerCapabilities: ["GLBA readiness support"],
        sellerBusinessOutcomes: ["stronger security readiness"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence(financialLead, "it_services", securitySeller, [{
      signalType: "security_incident",
      signalTitle: "Official security incident disclosure",
      signalDescription: "Example Financial disclosed that it contained unauthorized access to an email account.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company website",
      sourceURL: "https://example-financial.example/security-update",
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "The company states that it contained unauthorized access and completed its investigation.",
      points: 0,
    }] as any);

    expect(intelligence.potentialNeeds).toHaveLength(1);
    expect(intelligence.potentialNeeds[0]).toMatch(/GLBA, the FTC Safeguards Rule/i);
    expect(intelligence.potentialNeeds[0]).toContain("GLBA readiness support");
    expect(intelligence.recommendedOutreach).toMatch(/submitted public breach record|officially disclosed/i);
    expect(intelligence.whyTarget).toContain("Official security incident disclosure");
  });

  it("turns a dated official breach disclosure into careful seller-specific outreach", () => {
    const [incident] = extractOfficialResearchSignals("CornerStone Medical", [{
      url: new URL("https://cornerstone.example/news/security-update"),
      html: `<html><head><meta property="article:published_time" content="2026-08-15" /></head>
        <body><p>CornerStone Medical identified a cybersecurity incident and responded by containing the affected systems.</p></body></html>`,
    }], new Date().toISOString()).filter(signal => signal.signalType === "security_incident");
    const seller = {
      ...readySeller,
      sellerIntelligenceProfile: {
        ...readySeller.sellerIntelligenceProfile,
        sellerCompanyName: "SecurePath IT",
        sellerServices: ["cybersecurity assessment", "managed IT services"],
        sellerCapabilities: ["incident recovery validation"],
        sellerBusinessOutcomes: ["stronger security resilience"],
        sellerCTAs: ["recommend a remediation-readiness review"],
      },
    } as any;
    const intelligence = buildOpportunityIntelligence(
      { ...lead, companyName: "CornerStone Medical", industry: "Healthcare" },
      "it_services",
      seller,
      [incident],
    );

    expect(incident).toMatchObject({
      signalClassification: "verified",
      sourceName: "Official company disclosure",
    });
    expect(intelligence.recommendedOutreach).toContain("CornerStone Medical");
    expect(intelligence.recommendedOutreach).toContain("incident recovery validation");
    expect(intelligence.recommendedOutreach).toMatch(/do not imply the issue remains unresolved/i);
    expect(intelligence.recommendedOutreach).toContain("remediation-readiness review");
  });

  it("awards seller-match points only when prospect evidence maps to an approved offer", () => {
    const researched = [{
      signalType: "rebrand",
      signalTitle: "Official rebrand announcement",
      signalDescription: "Northwind Mechanical announced a company rebrand.",
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "recent",
      sourceName: "Official company news",
      sourceURL: "https://northwind.example/news/rebrand",
      sourceDate: new Date().toISOString(),
      dateDiscovered: new Date().toISOString(),
      supportingEvidence: "The company announcement describes the rebrand.",
      points: 0,
    }] as any;
    const ready = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller, researched);
    const noEvidence = buildOpportunityIntelligence(lead, "fleet_wraps", readySeller);
    const limited = buildOpportunityIntelligence(lead, "fleet_wraps", undefined, researched);
    const readyMatch = ready.breakdown.find(item => item.key === "seller_prospect_match");
    const noEvidenceMatch = noEvidence.breakdown.find(item => item.key === "seller_prospect_match");
    const limitedMatch = limited.breakdown.find(item => item.key === "seller_prospect_match");

    expect(readyMatch?.points).toBeGreaterThan(limitedMatch?.points ?? 0);
    expect(noEvidenceMatch?.points).toBe(0);
    expect(readyMatch?.evidence[0]).toMatch(/rebrand.+fleet lettering/i);
  });

  it("gives different scores when individual prospect criteria differ", () => {
    const sparse = buildOpportunityIntelligence({
      ...lead,
      address: null,
      website: null,
      phone: null,
    }, "fleet_wraps", readySeller);
    const profiled = buildOpportunityIntelligence({
      ...lead,
      employeeCount: 84,
    }, "fleet_wraps", readySeller);

    expect(sparse.score).not.toBe(profiled.score);
    expect(sparse.breakdown.find(item => item.key === "company_industry_fit")?.points).toBe(3);
    expect(profiled.breakdown.find(item => item.key === "company_industry_fit")?.points).toBe(20);
    expect(profiled.breakdown.filter(item => item.points > 0).every(item => item.evidence.length > 0)).toBe(true);
  });

  it("upgrades a stored legacy score using its prospect-specific evidence", () => {
    const legacy = {
      ...buildOpportunityIntelligence(lead, "fleet_wraps", readySeller),
      version: 1 as const,
      score: 77,
    };
    const upgraded = upgradeStoredOpportunityIntelligence(
      { ...lead, title: lead.contactTitle, opportunityIntelligence: legacy },
      "fleet_wraps",
      readySeller,
      legacy,
    );

    expect(upgraded?.version).toBe(3);
    expect(upgraded?.score).not.toBe(77);
    expect(upgraded?.score).toBe(upgraded?.breakdown.reduce((sum, item) => sum + item.points, 0));
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