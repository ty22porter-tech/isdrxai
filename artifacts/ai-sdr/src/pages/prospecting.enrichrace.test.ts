import { describe, it, expect } from "vitest";
import type { ProspectLead } from "@workspace/api-client-react";
import { applyEnrichmentResults } from "./prospecting";

const lead = (companyName: string, email: string): ProspectLead =>
  ({
    companyName,
    contactName: "Owner",
    contactTitle: "Decision maker (pending enrichment)",
    email,
    phone: "555-0100",
    industry: "Technology",
    city: "Chicago",
    state: "IL",
    website: "example.com",
    whyTarget: "why",
    confidence: "high",
  }) as ProspectLead;

describe("applyEnrichmentResults — stale-run safety", () => {
  it("applies enrichment when the current lead matches the enriched snapshot", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid")];
    const out = applyEnrichmentResults(snapshot, snapshot, [
      { index: 0, status: "enriched", contactName: "Jane Doe", email: "jane@acme.com", title: "Facilities Manager" },
    ]);
    expect(out[0].contactName).toBe("Jane Doe");
    expect(out[0].email).toBe("jane@acme.com");
    expect(out[0].contactTitle).toBe("Facilities Manager");
  });

  it("never writes search A's contacts onto search B's leads (index collision)", () => {
    // Search A was enriched, but search B has since replaced the list. The
    // lead at index 0 is now a different business.
    const searchA = [lead("Acme Cleaning", "contact@acme.invalid")];
    const searchB = [lead("Bravo Dental", "contact@bravo.invalid")];
    const out = applyEnrichmentResults(searchB, searchA, [
      { index: 0, status: "enriched", contactName: "Jane Doe", email: "jane@acme.com" },
    ]);
    // Bravo Dental must be untouched — Jane Doe belongs to Acme.
    expect(out[0].contactName).toBe("Owner");
    expect(out[0].email).toBe("contact@bravo.invalid");
  });

  it("leaves not_found and failed leads unchanged", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid"), lead("Bravo Dental", "contact@bravo.invalid")];
    const out = applyEnrichmentResults(snapshot, snapshot, [
      { index: 0, status: "not_found" },
      { index: 1, status: "failed", },
    ]);
    expect(out[0]).toEqual(snapshot[0]);
    expect(out[1]).toEqual(snapshot[1]);
  });

  it("ignores results whose index has no matching snapshot lead", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid")];
    const current = [lead("Acme Cleaning", "contact@acme.invalid"), lead("Bravo Dental", "contact@bravo.invalid")];
    const out = applyEnrichmentResults(current, snapshot, [
      { index: 1, status: "enriched", contactName: "Wrong Person", email: "wrong@x.com" },
    ]);
    expect(out[1].contactName).toBe("Owner");
  });
});
