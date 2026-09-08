import { describe, it, expect } from "vitest";
import { extractPersonFromApolloData, isPlausibleCompanyMatch } from "./apollo";

const target = { companyName: "Mockingbird Food Group", domain: null };

describe("isPlausibleCompanyMatch", () => {
  it("rejects a person from a completely different company (wrong-match bug)", () => {
    const swede = {
      email: "marja.hallikainen@basalt.se",
      organization: { name: "Basalt AB", website_url: "https://basalt.se" },
    };
    expect(isPlausibleCompanyMatch(swede, target)).toBe(false);
  });

  it("accepts when the org name shares a distinctive word", () => {
    const p = { organization: { name: "Mockingbird Foods LLC" } };
    expect(isPlausibleCompanyMatch(p, target)).toBe(true);
  });

  it("accepts when the org domain matches the company website", () => {
    const p = { organization: { name: "MFG", website_url: "https://mockingbirdfood.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "mockingbirdfood.com" })).toBe(true);
  });

  it("accepts when the revealed email domain matches the company website", () => {
    const p = { email: "jane@mockingbirdfood.com", organization: { name: "Different Listed Name" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "mockingbirdfood.com" })).toBe(true);
  });

  it("rejects when only generic corporate words overlap", () => {
    const p = { organization: { name: "Global Services Group Inc" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Acme Services Group", domain: null })).toBe(false);
  });

  it("rejects when Apollo returns no organization info at all", () => {
    expect(isPlausibleCompanyMatch({ }, target)).toBe(false);
  });

  it("rejects a conflicting org domain even when the name resembles the target", () => {
    const p = { organization: { name: "Acme Dental", website_url: "https://acmedental.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Acme Manufacturing", domain: "acmemfg.com" })).toBe(false);
  });

  it("accepts a subdomain of the company's registrable domain", () => {
    const p = { organization: { name: "Whatever", website_url: "https://shop.mockingbirdfood.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "www.mockingbirdfood.com" })).toBe(true);
  });

  it("accepts punctuation/concatenation name variants", () => {
    const p = { organization: { name: "McDonalds Corporation" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "McDonald's", domain: null })).toBe(true);
  });

  it("preserves Apollo organization descriptions for company-specific intelligence", () => {
    const person = extractPersonFromApolloData({
      name: "Arjun Kooranotha",
      organization: {
        name: "Perfect General Contractors",
        website_url: "https://perfectgc.net",
        short_description: "Perfect General Contractors provides commercial construction management for clients across North Texas.",
        estimated_num_employees: 4,
      },
    });

    expect(person.organizationDescription).toContain("commercial construction management");
    expect(person.employeeCount).toBe(4);
  });
});
