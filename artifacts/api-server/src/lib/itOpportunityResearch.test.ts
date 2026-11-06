import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  cacheTrustedItResearch,
  getTrustedItResearch,
  approvedOfferingsForResearch,
  attachResearchProof,
  parseItOpportunityResearchResponse,
  researchItOpportunityIntelligence,
  trustedItResearchCacheKey,
  verifiedResearchProof,
  verifyResearchHandoff,
  withResearchPipelineTimeout,
  ItOpportunityResearchTimeoutError,
} from "./itOpportunityResearch";
import { deriveOpportunityForPersistence } from "./opportunityIntelligence";

const seller = {
  id: "tenant-a",
  sellerServicePriorities: "managed detection and response, backup and disaster recovery",
  sellerIntelligenceProfile: {
    status: "ready",
    websiteAnalysisStatus: "ready",
    sellerCompanyName: "SecurePath IT",
    sellerServices: ["managed IT services", "managed detection and response", "backup and disaster recovery"],
    sellerProducts: [],
    sellerCapabilities: ["endpoint security"],
    sellerDifferentiators: [],
    sellerCertifications: [],
    sellerIndustriesServed: [],
    sellerBusinessOutcomes: [],
    sellerProblemsSolved: [],
    sellerProofPoints: [],
    sellerPortfolioExamples: [],
    sellerValuePropositions: [],
    sellerCTAs: [],
  },
} as any;

const backupOfferingId = approvedOfferingsForResearch(seller)
  .find(item => item.offering === "backup and disaster recovery")!.id;

const response = {
  output: [{
    type: "web_search_call",
    status: "completed",
    action: { sources: [{ url: "https://example.com/company-news", title: "Example Health announcement", published_date: "2026-08-01T00:00:00Z" }] },
  }, {
    type: "message",
    content: [{
      type: "output_text",
      text: JSON.stringify({
        actualIndustry: "Healthcare provider",
        industryRelationship: "mismatch",
        industryExplanation: "The cited company announcement describes a healthcare provider rather than a manufacturer.",
        industrySources: [{ url: "https://example.com/company-news" }],
        warnings: [],
        industryChallenges: [{
          title: "Ransomware readiness",
          explanation: "A cited industry source describes the operational need for tested recovery.",
          businessImpact: "Extended system downtime can disrupt operations.",
          sources: [{ url: "https://example.com/company-news", publishedDate: "2026-08-01T00:00:00Z" }],
        }],
        prospectConcerns: [{
          id: "recovery",
          title: "Recovery planning",
          explanation: "The company announced a new location, which is a discovery signal for recovery planning.",
          businessImpact: "An outage could interrupt the new location.",
          evidence: "The cited company announcement names the new location.",
          evidenceScope: "company_operations",
          classification: "Verified",
          confidence: "medium",
          sources: [{ url: "https://example.com/company-news" }],
        }, {
          id: "industry-possibility",
          title: "Healthcare data protection",
          explanation: "This is an industry-based possibility, not a verified company condition.",
          businessImpact: "A gap could increase disruption risk.",
          evidence: "Reasoned from the company's stated healthcare operating model.",
          evidenceScope: "industry_context",
          classification: "Industry-Based Possibility",
          confidence: "low",
          sources: [{ url: "https://example.com/company-news" }],
        }],
        recommendations: [{
          concernId: "recovery",
          offeringId: backupOfferingId,
          howItHelps: "If recovery planning is a current priority, backup and disaster recovery can give the new location a tested restore process.",
          businessValue: "A tested recovery approach can help the new location resume patient-service workflows more predictably after an outage.",
          outreachAngle: "Reference the announced new location and ask about its recovery readiness rather than assuming there is a gap.",
          discoveryQuestion: "As the new location comes online, how are you validating backup and recovery for the systems staff rely on?",
        }],
      }),
    }],
  }],
};

describe("IT opportunity research", () => {
  it("accepts provider citation annotations when action.sources omits the official website", () => {
    const cited = structuredClone(response);
    (cited.output[0] as any).action.sources = [];
    (cited.output[1] as any).content[0].annotations = [{
      type: "url_citation", url: "https://example.com/company-news", title: "Official company announcement",
    }];
    const parsed = parseItOpportunityResearchResponse(cited, {
      selectedIndustry: "Manufacturing", companyName: "Example Health", website: "https://example.com",
    }, seller);
    expect(parsed?.industryRelationship).toBe("mismatch");
    expect(parsed?.industrySources[0].url).toBe("https://example.com/company-news");
    (cited.output[0] as any).status = "failed";
    expect(parseItOpportunityResearchResponse(cited, {
      selectedIndustry: "Manufacturing", website: "https://example.com",
    }, seller)).toBeUndefined();
  });
  it("does not discard official identity evidence after twenty unrelated search results", () => {
    const many = structuredClone(response);
    (many.output[0] as any).action.sources.unshift(...Array.from({ length: 25 }, (_, i) => ({
      url: `https://unrelated.example/page-${i}`, title: "Unrelated result",
    })));
    expect(parseItOpportunityResearchResponse(many, {
      selectedIndustry: "Manufacturing", website: "https://example.com",
    }, seller)?.industryRelationship).toBe("mismatch");
  });
  it("uses source-backed research offerings even when narrative depth leaves the profile needing review", () => {
    const needsReviewSeller = {
      ...seller,
      sellerIntelligenceProfile: {
        ...seller.sellerIntelligenceProfile,
        status: "needs_review",
        researchStatus: "ready",
        researchGenerated: {
          ...seller.sellerIntelligenceProfile,
          sellerCompanyName: "SecurePath IT",
          sellerServices: ["managed IT services"],
          sellerProducts: [],
          sellerCapabilities: ["endpoint security"],
          sellerValuePropositions: [],
        },
      },
    } as any;
    const offerings = approvedOfferingsForResearch(needsReviewSeller);
    expect(offerings.map(item => item.offering)).toEqual(expect.arrayContaining([
      "managed IT services",
      "endpoint security",
    ]));
    const importedSchemaSeller = {
      ...needsReviewSeller,
      sellerIntelligenceProfile: {
        ...needsReviewSeller.sellerIntelligenceProfile,
        researchStatus: undefined,
      },
    } as any;
    expect(approvedOfferingsForResearch(importedSchemaSeller).length).toBeGreaterThan(0);

    const responseWithActualOffering = structuredClone(response);
    const responseBody = JSON.parse((responseWithActualOffering.output[1] as any).content[0].text);
    responseBody.recommendations[0].offeringId = offerings[0].id;
    (responseWithActualOffering.output[1] as any).content[0].text = JSON.stringify(responseBody);
    const report = parseItOpportunityResearchResponse(responseWithActualOffering, {
      selectedIndustry: "Manufacturing",
      companyName: "Example Health",
      website: "https://example.com",
      sellerVertical: "it_services",
    }, needsReviewSeller);
    expect(report?.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ offering: offerings[0].offering }),
    ]));
  });

  it("keeps possibilities distinct from company-verified claims and flags mismatch", () => {
    const report = parseItOpportunityResearchResponse(response, {
      selectedIndustry: "Manufacturing",
      companyName: "Example Health",
      website: "https://example.com",
    }, seller);

    expect(report?.industryRelationship).toBe("mismatch");
    expect(report?.warnings.join(" ")).toMatch(/does not appear to match/i);
    expect(report?.prospectConcerns.map(item => item.classification)).toEqual([
      "Verified",
      "Industry-Based Possibility",
    ]);
    expect(report?.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ concernId: "recovery", offering: "backup and disaster recovery" }),
    ]));
    expect(report?.recommendations[0]?.businessValue).not.toBe(report?.prospectConcerns[0]?.businessImpact);
  });

  it("rejects uncited research instead of fabricating a report", () => {
    const noSources = structuredClone(response);
    (noSources.output[0] as any).action.sources = [];
    expect(parseItOpportunityResearchResponse(noSources, { selectedIndustry: "Healthcare", companyName: "Example Health", website: "https://example.com" }, seller)).toBeUndefined();
  });

  it("accepts equivalent seller profiles after JSONB field reordering but rejects changed services", () => {
    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-only-canonical-seller-revision-secret";
    try {
      const report = parseItOpportunityResearchResponse(response, {
        selectedIndustry: "Manufacturing", companyName: "Example Health", website: "https://example.com",
      }, seller)!;
      const lead = { companyName: "Example Health", website: "example.com", city: "Dallas", state: "TX" };
      const proof = attachResearchProof({ itResearch: report, signals: [] } as any, "tenant-a", lead, seller).researchProof;
      const reorder = (value: any): any => Array.isArray(value) ? value.map(reorder)
        : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]))
        : value;
      const reorderedSeller = reorder(JSON.parse(JSON.stringify(seller)));
      expect(verifyResearchHandoff(proof, "tenant-a", lead, reorderedSeller).ok).toBe(true);
      reorderedSeller.sellerIntelligenceProfile.lastAnalysisAttemptAt = "2026-11-06T00:00:00Z";
      reorderedSeller.sellerIntelligenceProfile.lastAnalysisAttemptStatus = "failed";
      reorderedSeller.sellerIntelligenceProfile.researchStatus = "failed";
      reorderedSeller.sellerIntelligenceProfile.analysisError = "A later refresh was rate-limited";
      expect(verifyResearchHandoff(proof, "tenant-a", lead, reorderedSeller).ok).toBe(true);
      const oldPayload = JSON.parse(Buffer.from(proof!.split(".")[0], "base64url").toString("utf8"));
      oldPayload.v = 2;
      oldPayload.sellerRevision = JSON.stringify({ vertical: seller.vertical,
        profile: seller.sellerIntelligenceProfile, priorities: seller.sellerServicePriorities ?? "" });
      const encoded = Buffer.from(JSON.stringify(oldPayload)).toString("base64url");
      const legacyProof = `${encoded}.${createHmac("sha256", process.env.SESSION_SECRET!).update(encoded).digest("base64url")}`;
      expect(verifyResearchHandoff(legacyProof, "tenant-a", lead, reorderedSeller).ok).toBe(true);
      reorderedSeller.sellerIntelligenceProfile.sellerServices = ["different approved service"];
      expect(verifyResearchHandoff(proof, "tenant-a", lead, reorderedSeller)).toEqual({ ok: false, reason: "seller_changed" });
      expect(verifyResearchHandoff(legacyProof, "tenant-a", lead, reorderedSeller)).toEqual({ ok: false, reason: "seller_changed" });
      const changedEvidence = reorder(JSON.parse(JSON.stringify(seller)));
      changedEvidence.sellerIntelligenceProfile.researchSources = [{ title: "Seller services", url: "https://seller.example/services" }];
      changedEvidence.sellerIntelligenceProfile.factEvidence = { sellerServices: {
        [seller.sellerIntelligenceProfile.sellerServices[0]]: ["https://seller.example/services"],
      } };
      expect(verifyResearchHandoff(proof, "tenant-a", lead, changedEvidence)).toEqual({ ok: false, reason: "seller_changed" });
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });

  it("requires an actually completed web-search call and preserves only tool-supplied dates", () => {
    const incomplete = structuredClone(response);
    delete (incomplete.output[0] as any).status;
    expect(parseItOpportunityResearchResponse(incomplete, {
      selectedIndustry: "Healthcare",
      companyName: "Example Health",
      website: "https://example.com",
    }, seller)).toBeUndefined();

    const inventedDate = structuredClone(response);
    const body = JSON.parse((inventedDate.output[1] as any).content[0].text);
    body.industryChallenges[0].sources[0].publishedDate = "1999-01-01T00:00:00Z";
    (inventedDate.output[1] as any).content[0].text = JSON.stringify(body);
    const report = parseItOpportunityResearchResponse(inventedDate, {
      selectedIndustry: "Healthcare",
      companyName: "Example Health",
    }, seller);
    expect(report?.industryChallenges[0]?.sources[0]?.publishedDate).toBe("2026-08-01T00:00:00.000Z");
  });

  it("keeps trusted research tenant-scoped and never requires a client report", () => {
    const report = parseItOpportunityResearchResponse(response, { selectedIndustry: "Manufacturing", companyName: "Example Health", website: "https://example.com" }, seller)!;
    const lead = { companyName: "Example Health", website: "example.com", city: "Dallas", state: "TX" };
    cacheTrustedItResearch("tenant-a", lead, "Manufacturing", seller, { itResearch: report, signals: [] });

    expect(getTrustedItResearch("tenant-a", lead, "Manufacturing", seller)?.itResearch.actualIndustry).toBe("Healthcare provider");
    expect(getTrustedItResearch("tenant-b", lead, "Manufacturing", seller)).toBeUndefined();
  });

  it("keys trusted research by demographics and the supplied actual/listing industry", () => {
    const base = { companyName: "Example Health", website: "example.com", city: "Dallas", state: "TX", industry: "Healthcare", employeeCount: 75 };
    expect(trustedItResearchCacheKey("tenant-a", base, "Manufacturing", seller))
      .not.toBe(trustedItResearchCacheKey("tenant-a", { ...base, industry: "Medical Devices" }, "Manufacturing", seller));
    expect(trustedItResearchCacheKey("tenant-a", base, "Manufacturing", seller))
      .not.toBe(trustedItResearchCacheKey("tenant-a", { ...base, employeeCount: 300 }, "Manufacturing", seller));
  });

  it("retains the prior server-selected campaign industry after a saved prospect's actual industry changes", async () => {
    const report = parseItOpportunityResearchResponse(response, {
      selectedIndustry: "Manufacturing",
      companyName: "Example Health",
      website: "https://example.com",
    }, seller)!;
    const savedLead = {
      companyName: "Example Health",
      industry: "Healthcare provider",
      city: "Dallas",
      state: "TX",
      website: "example.com",
    };
    cacheTrustedItResearch("tenant-a", savedLead, "Manufacturing", seller, { itResearch: report, signals: [] });
    const intelligence = await deriveOpportunityForPersistence({
      ...savedLead,
      opportunityIntelligence: {},
    } as any, "it_services", seller, { itResearch: report } as any, "tenant-a");
    expect(intelligence?.itResearch?.selectedIndustry).toBe("Manufacturing");
  });

  it("signs a durable tenant, seller, and prospect-bound research handoff", () => {
    const prior = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "a-strong-test-session-secret-that-is-at-least-32-chars";
    try {
      const lead = { companyName: "Example Health", website: "https://example.com", industry: "Healthcare", city: "Dallas", state: "TX" };
      const report = parseItOpportunityResearchResponse(response, {
        selectedIndustry: "Manufacturing", companyName: lead.companyName, website: lead.website,
      }, seller)!;
      const signed = attachResearchProof({ itResearch: report } as any, "tenant-a", lead, seller);
      expect(verifiedResearchProof(signed.researchProof, "tenant-a", lead, seller)?.selectedIndustry).toBe("Manufacturing");
      expect(verifiedResearchProof(signed.researchProof, "tenant-b", lead, seller)).toBeUndefined();
      expect(verifiedResearchProof(signed.researchProof, "tenant-a", { ...lead, website: "https://other.example" }, seller)).toBeUndefined();
      expect(verifiedResearchProof(signed.researchProof, "tenant-a", { ...lead, employeeCount: 84 }, seller)).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prior;
    }
  });

  it("downgrades an industry-only cited source instead of allowing a verified claim", () => {
    const industryOnly = structuredClone(response);
    (industryOnly.output[0] as any).action.sources[0] = {
      url: "https://regulator.example.org/healthcare-guidance",
      title: "Healthcare security guidance",
    };
    (industryOnly.output[1] as any).content[0].text = (industryOnly.output[1] as any).content[0].text
      .replaceAll("https://example.com/company-news", "https://regulator.example.org/healthcare-guidance");
    const report = parseItOpportunityResearchResponse(industryOnly, {
      selectedIndustry: "Healthcare",
      companyName: "Acme Clinic",
    }, seller);
    expect(report?.prospectConcerns[0]).toMatchObject({
      classification: "Industry-Based Possibility",
      confidence: "low",
    });
    expect(report?.prospectConcerns[0]?.explanation).toMatch(/^Industry-based possibility only:/);
  });

  it("does not treat a vendor's healthcare threat report as the vendor's own healthcare problem", () => {
    const customerReport = structuredClone(response);
    (customerReport.output[0] as any).action.sources[0] = {
      url: "https://www.cloudflare.com/threat-reports/healthcare",
      title: "Cloudflare healthcare threat report",
    };
    const body = JSON.parse((customerReport.output[1] as any).content[0].text);
    body.industrySources = [{ url: "https://www.cloudflare.com/threat-reports/healthcare" }];
    body.prospectConcerns[0] = {
      ...body.prospectConcerns[0],
      title: "Rising healthcare attack volume",
      explanation: "Cloudflare reports rising attacks against healthcare customers.",
      evidence: "Cloudflare's report describes healthcare-sector attack trends.",
      evidenceScope: "customer_context",
      classification: "Strong Indicator",
      confidence: "high",
      sources: [{ url: "https://www.cloudflare.com/threat-reports/healthcare" }],
    };
    body.recommendations[0].concernId = "recovery";
    (customerReport.output[1] as any).content[0].text = JSON.stringify(body)
      .replaceAll("https://example.com/company-news", "https://www.cloudflare.com/threat-reports/healthcare");
    const report = parseItOpportunityResearchResponse(customerReport, {
      selectedIndustry: "Healthcare",
      companyName: "Cloudflare",
      website: "https://www.cloudflare.com",
    }, seller);
    expect(report?.prospectConcerns[0]).toMatchObject({
      classification: "Industry-Based Possibility",
      confidence: "low",
    });
    expect(report?.prospectConcerns[0]?.explanation).toMatch(/^Customer-context only:/);
  });

  it("rejects invented offering IDs and explains insufficient evidence or catalog matches", () => {
    expect(approvedOfferingsForResearch(seller).map(item => item.id)).toContain(backupOfferingId);
    const inventedOffer = structuredClone(response);
    const inventedReport = JSON.parse((inventedOffer.output[1] as any).content[0].text);
    inventedReport.recommendations[0].offeringId = "invented-offering";
    (inventedOffer.output[1] as any).content[0].text = JSON.stringify(
      inventedReport,
    );
    const report = parseItOpportunityResearchResponse(inventedOffer, {
      selectedIndustry: "Manufacturing",
      companyName: "Example Health",
      website: "https://example.com",
    }, seller);
    expect(report?.recommendations).toEqual([]);
    expect(report?.warnings.join(" ")).toMatch(/Fewer than three industry IT challenges|No confirmed tenant offering/i);
  });

  it("keeps seller evidence scoped to the exact catalog offering and never trusts model URLs", () => {
    const sourceBackedSeller = {
      ...seller,
      sellerIntelligenceProfile: {
        ...seller.sellerIntelligenceProfile,
        factEvidence: {
          sellerServices: {
            "backup and disaster recovery": ["https://example.com/company-news"],
          },
        },
        researchSources: [{
          title: "SecurePath services",
          url: "https://example.com/company-news",
          publishedDate: "2026-08-01T00:00:00.000Z",
        }],
      },
    } as any;
    const reportInput = structuredClone(response);
    const body = JSON.parse((reportInput.output[1] as any).content[0].text);
    const offering = approvedOfferingsForResearch(sourceBackedSeller)
      .find(item => item.offering === "backup and disaster recovery")!;
    body.recommendations[0].offeringId = offering.id;
    body.recommendations[0].sellerEvidence = {
      availability: "source_backed",
      sources: [{ title: "Invented model source", url: "https://model-invented.example/source" }],
    };
    (reportInput.output[1] as any).content[0].text = JSON.stringify(body);
    const report = parseItOpportunityResearchResponse(reportInput, {
      selectedIndustry: "Manufacturing",
      companyName: "Example Health",
      website: "https://example.com",
    }, sourceBackedSeller)!;
    expect(report.recommendations[0]?.sellerEvidence).toEqual({
      availability: "source_backed",
      basis: "This exact seller offering was validated in company-name research.",
      sources: [{
        title: "SecurePath services",
        url: "https://example.com/company-news",
        publishedDate: "2026-08-01T00:00:00.000Z",
      }],
    });
  });

  it("labels user-approved offer overrides without borrowing generated source evidence", () => {
    const userApproved = {
      ...seller,
      sellerIntelligenceProfile: {
        ...seller.sellerIntelligenceProfile,
        userOverrides: {
          sellerServices: ["approved by settings"],
        },
        factEvidence: {
          sellerServices: {
            "approved by settings": ["https://example.com/company-news"],
          },
        },
      },
    } as any;
    const offering = approvedOfferingsForResearch(userApproved)
      .find(item => item.offering === "approved by settings");
    expect(offering?.sellerEvidence).toEqual({
      availability: "user_approved",
      basis: "This offering was explicitly approved or edited in Settings.",
      sources: [],
    });
  });

  it("does not put benefit-only value propositions in the saleable offering catalog", () => {
    const offers = approvedOfferingsForResearch({
      ...seller,
      sellerIntelligenceProfile: {
        ...seller.sellerIntelligenceProfile,
        sellerValuePropositions: ["reduce downtime"],
      },
    } as any);
    expect(offers.map(item => item.offering)).not.toContain("reduce downtime");
  });

  it("surfaces a research-service failure instead of returning an invented refresh", async () => {
    const priorBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const priorKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    try {
      await expect(researchItOpportunityIntelligence({
        clientId: "tenant-a",
        lead: { companyName: "Unresearched Co." },
        selectedIndustry: "Healthcare",
        client: seller,
        force: true,
      })).rejects.toThrow(/research is unavailable/i);
    } finally {
      if (priorBase === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = priorBase;
      if (priorKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = priorKey;
    }
  });

  it("enforces an absolute pipeline deadline even when a phase never settles", async () => {
    await expect(withResearchPipelineTimeout(new Promise<never>(() => {}), 1))
      .rejects.toBeInstanceOf(ItOpportunityResearchTimeoutError);
  });
});
