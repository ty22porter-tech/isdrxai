import { describe, expect, it } from "vitest";
import { evaluateEmailRelevance } from "./emailRelevance";
import type { SellerIntelligence } from "./prospectMatching";

const readySeller: SellerIntelligence = {
  name: "Northstar Systems",
  services: ["managed security monitoring"],
  products: [],
  capabilities: ["multi-location endpoint protection"],
  differentiators: ["24-hour response team"],
  certifications: [],
  industriesServed: ["Healthcare"],
  outcomes: ["reduce security exposure across growing locations"],
  problemsSolved: [],
  proof: [],
  portfolioExamples: [],
  valuePropositions: [],
  ctas: ["compare the current security approach"],
  ready: true,
};

const limitedSeller: SellerIntelligence = {
  services: [], products: [], capabilities: [], differentiators: [],
  certifications: [], industriesServed: [], outcomes: [], problemsSolved: [],
  proof: [], portfolioExamples: [], valuePropositions: [], ctas: [], ready: false,
};

describe("email relevance quality gate", () => {
  it("accepts a prospect-grounded seller value match", () => {
    const result = evaluateEmailRelevance(
      "Supporting Lakeview Health's expansion",
      `Hi Jordan,

Adding healthcare locations can increase the endpoints a team has to secure and support.

Northstar Systems' multi-location endpoint protection and 24-hour response team could help reduce security exposure across growing locations.

Would it be worth comparing Lakeview Health's current security approach?`,
      { companyName: "Lakeview Health", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("rejects a generic prohibited opening", () => {
    const result = evaluateEmailRelevance(
      "Quick question",
      `Hi Jordan,

I noticed your company and wanted to reach out.

We offer many great services. Can we schedule a sales demo?`,
      { companyName: "Lakeview Health", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(result.score).toBeLessThan(70);
    expect(result.reasons.join(" ")).toMatch(/opening|prospect/i);
  });

  it("rejects an industry-and-city email that never identifies the prospect company", () => {
    const result = evaluateEmailRelevance(
      "Security support for healthcare growth",
      `Hi Jordan,

Healthcare organizations in Dallas can face more endpoints and security exposure as they grow.

Multi-location endpoint protection with a 24-hour response team can reduce security exposure across growing locations.

Would it be worth comparing your current security approach?`,
      { companyName: "Lakeview Health", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(result.score).toBeLessThan(70);
    expect(result.reasons.join(" ")).toMatch(/company|unrelated/i);
  });

  it("recognizes a one-token prospect company name", () => {
    const result = evaluateEmailRelevance(
      "Supporting Acme's healthcare expansion",
      `Hi Jordan,

Adding healthcare locations can increase the endpoints Acme has to secure and support.

Multi-location endpoint protection and a 24-hour response team could help reduce security exposure across growing locations.

Would it be worth comparing Acme's current security approach?`,
      { companyName: "Acme", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("does not match a short company name inside an unrelated word", () => {
    const result = evaluateEmailRelevance(
      "A place for better healthcare security",
      `Hi Jordan,

Healthcare organizations in Dallas can place more demands on security teams as they grow.

Multi-location endpoint protection and a 24-hour response team could help reduce security exposure across growing locations.

Would it be worth comparing your current security approach?`,
      { companyName: "Ace", contactName: "Jordan", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(result.score).toBeLessThan(70);
  });

  it("uses the exact contact name for an ambiguous company name", () => {
    const body = `Hi Jordan,

Healthcare growth can increase the endpoints a team has to secure and support.

Multi-location endpoint protection and a 24-hour response team could help reduce security exposure across growing locations.

Jordan, would it be worth comparing your current security approach?`;
    const withContact = evaluateEmailRelevance(
      "Supporting healthcare expansion",
      body,
      { companyName: "IT", contactName: "Jordan", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    const withoutContact = evaluateEmailRelevance(
      "Supporting healthcare expansion",
      body.replaceAll("Jordan", "there"),
      { companyName: "IT", contactName: "Jordan", industry: "Healthcare", city: "Dallas", seller: readySeller },
    );
    expect(withContact.score).toBeGreaterThanOrEqual(70);
    expect(withoutContact.score).toBeLessThan(70);
  });

  it("allows a grounded discovery email when seller intelligence is limited", () => {
    const result = evaluateEmailRelevance(
      "A facility question for Harbor Logistics",
      `Hi Sam,

Warehouse operations in Dallas often have to balance facility consistency with daily workflow.

Before suggesting a solution, how is Harbor Logistics handling this today?

Would it be worth comparing your current approach?`,
      { companyName: "Harbor Logistics", industry: "Logistics & Warehousing", city: "Dallas", seller: limitedSeller },
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("blocks an unsupported prospect trigger stated as fact", () => {
    const result = evaluateEmailRelevance(
      "Supporting Acme's expansion",
      `Hi Jordan,

Acme is expanding its fleet, creating an immediate need for stronger field branding.

Multi-location branding support could help keep new vehicles consistent.

Would it be worth comparing your current approach?`,
      {
        companyName: "Acme",
        contactName: "Jordan",
        industry: "HVAC",
        city: "Dallas",
        seller: readySeller,
        verifiedProspectContext: ["Acme has a published business address and website"],
        unconfirmedProspectTopics: ["Vehicle purchase or expansion plans"],
      },
    );
    expect(result.score).toBeLessThan(70);
    expect(result.reasons.join(" ")).toMatch(/unsupported prospect claim/i);
  });

  it.each([
    "Acme bought three vehicles for its growing team.",
    "Acme added two locations this year.",
    "New vehicles are arriving for Acme.",
    "Acme's new location is now open.",
    "Acme now operates three locations.",
    "Acme has expanded.",
    "Acme plans to expand into Dallas next year.",
    "Acme is seeking a new IT provider.",
    "Acme needs better technology support.",
    "Acme struggles with slow response.",
    "If you're available, Acme bought three vehicles.",
    "Acme runs an outdated IT system.",
    "Acme is preparing for operational changes.",
    "Acme has a published address in Dallas and runs outdated systems.",
  ])("blocks unsupported event wording: %s", (claim) => {
    const result = evaluateEmailRelevance(
      "A branding question for Acme",
      `Hi Jordan,

${claim}

Multi-location branding support could help keep field presentation consistent.

Would it be worth comparing your current approach?`,
      {
        companyName: "Acme",
        contactName: "Jordan",
        industry: "HVAC",
        city: "Dallas",
        seller: readySeller,
        verifiedProspectContext: ["Acme has a published address in Dallas"],
        verifiedProspectSignalTypes: ["business_listing", "company_website"],
      },
    );
    expect(result.reasons.join(" ")).toMatch(/unsupported prospect claim/i);
  });

  it("allows the same topic when it is explicitly conditional", () => {
    const result = evaluateEmailRelevance(
      "A branding question for Acme",
      `Hi Jordan,

If Acme expands its fleet, consistent vehicle branding could help strengthen field recognition.

Would it be worth comparing your current approach?`,
      {
        companyName: "Acme",
        contactName: "Jordan",
        industry: "HVAC",
        city: "Dallas",
        seller: readySeller,
        verifiedProspectSignalTypes: ["business_listing"],
      },
    );
    expect(result.reasons.join(" ")).not.toMatch(/unsupported prospect claim/i);
  });
});