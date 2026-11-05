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
  it("retains department rationale with the matched contact for saved search snapshots", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid")];
    const contactMatch = { kind: "department" as const, department: "Software Engineering",
      openingTitles: ["Software Engineer"], reason: "Likely contact, not confirmed hiring manager.", locationMatch: false };
    const out = applyEnrichmentResults(snapshot, snapshot, [{
      index: 0, status: "enriched", contactName: "Engineering Lead", email: "lead@acme.com",
      title: "Engineering Manager", contactMatch,
    }]);
    expect(out[0].contactMatch).toEqual(contactMatch);
    expect(JSON.parse(JSON.stringify(out))[0].contactMatch).toEqual(contactMatch);
    const other = [lead("Other company", "other@other.invalid")];
    expect(applyEnrichmentResults(other, snapshot, [{
      index: 0, status: "enriched", contactMatch,
    }])[0].contactMatch).toBeUndefined();
  });
  it("applies demographic intelligence when Apollo finds no contact", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid")];
    const intelligence = {
      score: 64,
      label: "Strong Fit",
      whyTarget: "Size-specific fit",
      potentialNeeds: ["Scalable support"],
      recommendedOutreach: "Size-specific outreach",
    } as any;
    const out = applyEnrichmentResults(snapshot, snapshot, [{
      index: 0,
      status: "not_found",
      employeeCount: 84,
      opportunityIntelligence: intelligence,
    }]);

    expect(out[0].contactName).toBe("Owner");
    expect(out[0].estimatedEmployees).toBe(84);
    expect(out[0].recommendedOutreach).toBe("Size-specific outreach");
    expect(out[0].opportunityIntelligence).toBe(intelligence);
  });

  it("applies enrichment when the current lead matches the enriched snapshot", () => {
    const snapshot = [lead("Acme Cleaning", "contact@acme.invalid")];
    const out = applyEnrichmentResults(snapshot, snapshot, [
      { index: 0, status: "enriched", contactName: "Jane Doe", email: "jane@acme.com", title: "Facilities Manager" },
    ]);
    expect(out[0].contactName).toBe("Jane Doe");
    expect(out[0].email).toBe("jane@acme.com");
    expect(out[0].contactTitle).toBe("Facilities Manager");
  });

  it("retains an enriched contact and existing intelligence when optional research is absent", () => {
    const existingIntelligence = { score: 77, label: "Strong Fit", whyTarget: "Existing proof" } as any;
    const current = [{ ...lead("Acme Cleaning", "contact@acme.invalid"), opportunityIntelligence: existingIntelligence }];
    const snapshot = [{ ...current[0] }];
    const out = applyEnrichmentResults(current, snapshot, [{
      index: 0,
      status: "enriched",
      contactName: "Jane Doe",
      email: "jane@acme.com",
      title: "Operations Director",
      researchWarning: "Opportunity research was unavailable; existing opportunity intelligence was kept.",
    }]);

    expect(out[0].contactName).toBe("Jane Doe");
    expect(out[0].email).toBe("jane@acme.com");
    expect(out[0].opportunityIntelligence).toBe(existingIntelligence);
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
