import { describe, it, expect } from "vitest";
import { applyEnrichmentResults, retainRecruitingContacts } from "./prospecting";
import type { ProspectLead } from "@workspace/api-client-react";
type EnrichLeadResult = Parameters<typeof applyEnrichmentResults>[2][number];

describe("applyEnrichmentResults with refresh races", () => {
  it("keeps enriched contacts and signed demographics when retrying failed research", () => {
    const previous = { companyName: "Synthetic Employer", website: "example.com", email: "manager@example.com",
      estimatedEmployees: 400, opportunityIntelligence: { researchProof: "signed-for-400" } } as ProspectLead;
    const fresh = { ...previous, email: "unknown@example.invalid", estimatedEmployees: undefined,
      opportunityIntelligence: { researchProof: "signed-without-demographics" } } as ProspectLead;
    expect(retainRecruitingContacts([fresh], [previous])[0]).toMatchObject({
      email: "manager@example.com", estimatedEmployees: 400,
      opportunityIntelligence: { researchProof: "signed-for-400" },
    });
    expect(retainRecruitingContacts([{ ...fresh, website: "different.example" }], [previous])[0].email)
      .toBe("unknown@example.invalid");
  });
  it("does not overwrite a fresher refresh with a stale enrichment", () => {
    const snapshot: ProspectLead[] = [
      { companyName: "A", email: "a@a.com", contactName: "A", contactTitle: "Title", phone: "", industry: "IT", city: "", state: "", whyTarget: "", confidence: "high", _intelligenceVersion: 0 } as any
    ];
    
    // User triggered refresh which completed, incrementing the version
    const current: ProspectLead[] = [
      { 
        companyName: "A", email: "a@a.com", contactName: "A", contactTitle: "Title", phone: "", industry: "IT", city: "", state: "", whyTarget: "New target", confidence: "high",
        _intelligenceVersion: 1,
        opportunityScore: 99,
        opportunityIntelligence: { score: 99, label: "Strong Fit" } as any
      } as any
    ];

    const results: EnrichLeadResult[] = [
      {
        index: 0,
        status: "enriched",
        contactName: "Better Name",
        email: "better@a.com",
        opportunityIntelligence: { score: 50, label: "Low Priority" } as any
      }
    ];

    const updated = applyEnrichmentResults(current, snapshot, results);
    
    // Should get the contact updates from enrichment
    expect(updated[0].contactName).toBe("Better Name");
    expect(updated[0].email).toBe("better@a.com");
    
    // But MUST retain the fresher opportunity score/intelligence
    expect(updated[0].opportunityScore).toBe(99);
    expect(updated[0].opportunityIntelligence?.score).toBe(99);
  });
});
