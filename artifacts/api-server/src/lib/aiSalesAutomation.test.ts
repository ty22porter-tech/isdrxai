import { describe, expect, it } from "vitest";
import { isSalesBuyerContact, assertSalesAutomationEmail, salesAutomationEmailRules, salesCostComparison } from "@workspace/db/ai-sales-automation";
import { buildOpportunityIntelligence } from "./opportunityIntelligence";
import { getVerticalConfig, normalizeVertical } from "./verticals";
import { verticalResearchInstructions } from "./itOpportunityResearch";
import { industryMatch } from "./prospectMatching";
import { DECISION_MAKER_TITLES } from "./apollo";
import { belongsToVertical } from "./verticalScope";
import { composeEmail } from "./emailCompose";

const proof = "AI Sales cost comparison | baseline annual cost: 100000 | software annual cost: 35000 | basis: like-for-like role scope including all software and operating costs | source: https://seller.example/cost-comparison";
const profile = { sellerIndustry: "ai_sales_automation", userOverrides: { sellerProofPoints: [proof] } };
const client = { vertical: "ai_sales_automation", sellerIntelligenceProfile: profile };
const claim = "Depending on your current process and costs, we could help you save up to 65%.";

describe("AI Sales Automation vertical", () => {
  it("normalizes explicitly while retaining existing defaults and industries", () => {
    for (const vertical of ["janitorial", "it_services", "fleet_wraps", "recruiting_staffing", "ai_sales_automation"]) {
      expect(normalizeVertical(vertical)).toBe(vertical);
      expect(getVerticalConfig(vertical).key).toBe(vertical);
    }
    expect(belongsToVertical(null, "ai_sales_automation")).toBe(false);
    expect(belongsToVertical("recruiting_staffing", "ai_sales_automation")).toBe(false);
    expect(belongsToVertical("ai_sales_automation", "ai_sales_automation")).toBe(true);
    expect(normalizeVertical("legacy-unknown")).toBe("janitorial");
    expect(getVerticalConfig("ai_sales_automation").senderDescriptor).toContain("autonomously");
  });
  it("treats staffing agencies as buyers and targets commercial leaders", () => {
    const instructions = verticalResearchInstructions("ai_sales_automation");
    expect(instructions.constraints).toContain("find staffing agencies that could buy this software");
    expect(instructions.constraints).toContain("Do not require job openings");
    const match = industryMatch("Recruiting & Staffing", "ai_sales_automation");
    expect(match.operation).toContain("Staffing agencies are buyers");
    expect(match.operation).toContain("costs");
    expect(DECISION_MAKER_TITLES.ai_sales_automation).toEqual(expect.arrayContaining(["owner", "ceo", "head of sales", "business development director"]));
    expect(DECISION_MAKER_TITLES.ai_sales_automation).not.toContain("facilities manager");
  });
  it("recognizes buying leaders without treating sales representatives as leaders", () => {
    for (const title of ["Owner", "CEO", "VP of Sales", "Director of Business Development", "Head of Sales"]) expect(isSalesBuyerContact(title)).toBe(true);
    for (const title of ["Sales Representative", "Recruiter", "Facilities Manager", "Decision maker (pending enrichment)"]) expect(isSalesBuyerContact(title)).toBe(false);
    const lead = { companyName: "Staffing Agency", contactTitle: "Owner", industry: "Recruiting & Staffing", city: "Dallas", state: "TX" };
    const report = buildOpportunityIntelligence(lead, "ai_sales_automation");
    expect(JSON.stringify(report)).not.toMatch(/janitorial provider|cleaning budget/i);
    expect(report.signals.filter(signal => signal.signalType === "unknown").map(signal => signal.signalTitle).join(" ")).toContain("prospecting");
    const contactComponent = report.breakdown.find(component => component.key === "decision_maker_match");
    expect(contactComponent?.points).toBeGreaterThan(0);
  });
  it("requires explicit configured comparison, source, basis, and supporting arithmetic", () => {
    expect(salesCostComparison(profile)).toMatchObject({ baseline: 100000, software: 35000 });
    expect(salesCostComparison({ ...profile, sellerIndustry: "recruiting_staffing" })).toBeUndefined();
    expect(salesCostComparison({ sellerIndustry: "ai_sales_automation", sellerProofPoints: [proof] })).toBeUndefined();
    for (const invalid of ["Save up to 65%", proof.replace("35000", "90000"), proof.replace("https://", "javascript:"), proof.replace("100000", "0"), proof.replace("35000", "0")]) {
      expect(salesCostComparison({ ...profile, userOverrides: { sellerProofPoints: [invalid] } })).toBeUndefined();
    }
  });
  it("guards generated and saved copy rather than trusting prompts", () => {
    expect(() => assertSalesAutomationEmail(claim, { vertical: "ai_sales_automation" })).toThrow(/comparison/);
    expect(() => assertSalesAutomationEmail(claim, client)).not.toThrow();
    for (const body of ["You will save 65%", "Guaranteed revenue growth", "You're spending $100000", "Save 70%", "Book here: https://calendly.com/made-up/demo"]) {
      expect(() => assertSalesAutomationEmail(body, client)).toThrow();
    }
    expect(() => assertSalesAutomationEmail("Book a time on the calendar below", client)).toThrow(/booking link/);
    expect(salesAutomationEmailRules(client)).toContain("seller-provided claim");
    expect(salesAutomationEmailRules({ vertical: "ai_sales_automation" })).toContain("Omit ALL numerical");
  });
  it("composes only the actual configured booking link and blocks unsupported saved claims", () => {
    const prospect = { companyName: "Agency", unsubscribeToken: "token", vertical: "ai_sales_automation" };
    const sender = { vertical: "ai_sales_automation", businessName: "iSDRX AI", businessAddress: "123 Test St" };
    const without = composeEmail("Hi Pat,\n\nWorth a conversation?", sender, prospect);
    expect(without.text).not.toContain("calendly.com");
    const withLink = composeEmail("Hi Pat,\n\nWorth a conversation?", { ...sender, calendlyUrl: "https://calendly.com/actual-seller/demo" }, prospect, { label: "Invented", url: "https://calendar.example/wrong" });
    expect(withLink.html).toContain('href="https://calendly.com/actual-seller/demo"');
    expect(withLink.text).toContain("Book a 15-minute conversation");
    expect(withLink.html).not.toContain("calendar.example");
    expect(() => composeEmail(claim, sender, prospect)).toThrow(/comparison/);
  });
});
