import { describe, expect, it } from "vitest";
import {
  applySellerIntelligenceSources,
  buildGenericSellerProfile,
  buildSellerIntelligenceContext,
  extractPublicText,
  normalizeWebsite,
} from "./sellerIntelligence";

describe("seller intelligence helpers", () => {
  it("normalizes a bare public website", () => expect(normalizeWebsite(" Example.com/about/ ")).toBe("https://example.com/about"));
  it("rejects non-http websites", () => expect(() => normalizeWebsite("file:///etc/passwd")).toThrow());
  it("extracts readable text without executable content", () => expect(extractPublicText("<script>secret()</script><h1>Acme &amp; Co</h1>")).toBe("Acme & Co"));
  it("does not put failed analysis in seller context", () => {
    const profile = buildGenericSellerProfile("https://example.com/", "it_services", "unavailable");
    expect(buildSellerIntelligenceContext(profile)).toBe("");
  });
  it("rejects non-standard website ports", () => {
    expect(() => normalizeWebsite("https://example.com:8443")).toThrow(/standard/i);
  });
  it("keeps user-approved intelligence above custom inputs and website facts", () => {
    const base = {
      ...buildGenericSellerProfile("https://example.com/", "it_services"),
      status: "needs_review" as const,
      websiteAnalysisStatus: "ready" as const,
      sellerCompanyName: "Example IT",
      sellerServices: ["managed IT"],
      sellerDifferentiators: ["website differentiator"],
      websiteGenerated: {
        sellerCompanyName: "Example IT",
        sellerServices: ["managed IT"],
        sellerProducts: [],
        sellerCapabilities: [],
        sellerDifferentiators: ["website differentiator"],
        sellerCertifications: [],
        sellerIndustriesServed: [],
        sellerBusinessOutcomes: [],
        sellerProblemsSolved: [],
        sellerProofPoints: [],
        sellerPortfolioExamples: [],
        sellerValuePropositions: [],
        sellerTypicalCustomers: [],
        sellerCTAs: [],
      },
    };
    const userOverrides = {
      ...base.websiteGenerated,
      sellerServices: ["approved cybersecurity"],
      sellerDifferentiators: ["approved response process"],
    };
    const merged = applySellerIntelligenceSources(base, {
      differentiatorsInput: "custom guarantee",
      servicePriorities: "cloud migration",
      userOverrides,
      userEditedAt: "2026-09-06T12:00:00.000Z",
    });
    expect(merged.sellerServices).toEqual(["approved cybersecurity"]);
    expect(merged.sellerDifferentiators).toEqual(["approved response process"]);
    expect(merged.status).toBe("ready");
    expect(merged.userEditedAt).toBe("2026-09-06T12:00:00.000Z");
  });

  it("keeps unedited fields live when lower-priority Settings inputs change", () => {
    const base = {
      ...buildGenericSellerProfile("https://example.com/", "it_services"),
      status: "needs_review" as const,
      websiteAnalysisStatus: "ready" as const,
      sellerCompanyName: "Example IT",
      sellerServices: ["managed IT"],
      websiteGenerated: {
        sellerCompanyName: "Example IT",
        sellerServices: ["managed IT"],
        sellerProducts: [],
        sellerCapabilities: [],
        sellerDifferentiators: ["website process"],
        sellerCertifications: [],
        sellerIndustriesServed: [],
        sellerBusinessOutcomes: [],
        sellerProblemsSolved: [],
        sellerProofPoints: [],
        sellerPortfolioExamples: [],
        sellerValuePropositions: [],
        sellerTypicalCustomers: [],
        sellerCTAs: [],
      },
      userOverrides: { sellerCapabilities: ["approved security operations"] },
      userEditedAt: "2026-09-06T12:00:00.000Z",
    };
    const merged = applySellerIntelligenceSources(base, {
      differentiatorsInput: "new guarantee",
      servicePriorities: "cloud migration",
    });
    expect(merged.sellerCapabilities).toEqual(["approved security operations"]);
    expect(merged.sellerServices).toEqual(["managed IT"]);
    expect(merged.sellerDifferentiators).toEqual(["new guarantee", "website process"]);
  });

  it("keeps service priorities separate from approved seller services", () => {
    const base = {
      ...buildGenericSellerProfile("https://example.com/", "it_services"),
      status: "needs_review" as const,
      websiteAnalysisStatus: "ready" as const,
      sellerCompanyName: "Example IT",
      sellerServices: ["managed IT"],
      websiteGenerated: {
        sellerCompanyName: "Example IT",
        sellerServices: ["managed IT"],
        sellerProducts: [],
        sellerCapabilities: [],
        sellerDifferentiators: [],
        sellerCertifications: [],
        sellerIndustriesServed: [],
        sellerBusinessOutcomes: [],
        sellerProblemsSolved: [],
        sellerProofPoints: [],
        sellerPortfolioExamples: [],
        sellerValuePropositions: [],
        sellerTypicalCustomers: [],
        sellerCTAs: [],
      },
    };
    const merged = applySellerIntelligenceSources(base, {
      servicePriorities: "cloud migration",
    });
    expect(merged.sellerServices).toEqual(["managed IT"]);
  });
});