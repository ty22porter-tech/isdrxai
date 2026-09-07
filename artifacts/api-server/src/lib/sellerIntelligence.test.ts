import { describe, expect, it } from "vitest";
import {
  applySellerIntelligenceSources,
  buildGenericSellerProfile,
  buildSellerIntelligenceContext,
  equivalentWebsite,
  extractPublicText,
  fetchPublicHtml,
  isSafelySameCompanyWebsite,
  normalizeWebsite,
} from "./sellerIntelligence";

describe("seller intelligence helpers", () => {
  it("normalizes a bare public website", () => expect(normalizeWebsite(" Example.com/about/ ")).toBe("https://example.com/about"));
  it("rejects blank and non-public-looking company websites", () => {
    expect(() => normalizeWebsite(" ")).toThrow(/required/i);
    expect(() => normalizeWebsite("localhost")).toThrow(/valid company website/i);
    expect(() => normalizeWebsite("http://127.0.0.1")).toThrow(/public/i);
  });
  it("recognizes equivalent URL spellings without suppressing a new landing-page analysis", () => {
    expect(equivalentWebsite("example.com/about/", "http://www.example.com/about")).toBe(true);
    expect(equivalentWebsite("https://example.com/", "https://example.com/services")).toBe(false);
  });
  it("uses the resolved hostname as the conservative automatic and manual reanalysis override-retention rule", () => {
    expect(isSafelySameCompanyWebsite("https://www.example.com/old", "http://example.com/new")).toBe(true);
    expect(isSafelySameCompanyWebsite("https://app.example.com", "https://example.com")).toBe(false);
    expect(isSafelySameCompanyWebsite("https://example.com", "https://example.net")).toBe(false);
    expect(isSafelySameCompanyWebsite("https://old-company.example", "https://redirected-company.example")).toBe(false);
  });
  it("rejects non-http websites", () => expect(() => normalizeWebsite("file:///etc/passwd")).toThrow());
  it("extracts readable text without executable content", () => expect(extractPublicText("<script>secret()</script><h1>Acme &amp; Co</h1>")).toBe("Acme & Co"));
  it("uses the validated public reader when a website blocks the production crawler", async () => {
    const requests: string[] = [];
    const result = await fetchPublicHtml("https://example.com/", {
      validateUrl: async value => new URL(value),
      fetcher: (async input => {
        const url = input.toString();
        requests.push(url);
        if (url === "https://example.com/") {
          return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/html" } });
        }
        return new Response("Title: Example\n\nManaged IT and cloud security services.", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }) as typeof fetch,
    });

    expect(requests).toEqual([
      "https://example.com/",
      "https://r.jina.ai/https://example.com/",
    ]);
    expect(result.url.toString()).toBe("https://example.com/");
    expect(result.html).toContain("Managed IT and cloud security services.");
  });
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