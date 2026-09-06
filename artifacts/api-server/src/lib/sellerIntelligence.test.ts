import { describe, expect, it } from "vitest";
import { buildGenericSellerProfile, buildSellerIntelligenceContext, extractPublicText, normalizeWebsite } from "./sellerIntelligence";

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
});