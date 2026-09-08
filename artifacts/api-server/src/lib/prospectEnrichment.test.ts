import { describe, expect, it, vi } from "vitest";
import type { ApolloEnrichment } from "./apollo";
import {
  mergeApolloEnrichment,
  runProspectEnrichment,
  type EnrichmentProspect,
} from "./prospectEnrichment";

const prospect = (overrides: Partial<EnrichmentProspect> = {}): EnrichmentProspect => ({
  id: 1,
  clientId: "client-1",
  companyName: "Acme Services",
  contactName: "Jamie Rivera",
  email: "jamie@acme.example",
  title: null,
  linkedinUrl: null,
  phone: "(000) 000-0000",
  city: "",
  state: "",
  website: null,
  employeeCount: null,
  vertical: "janitorial",
  ...overrides,
});

const apolloPerson = (overrides: Partial<ApolloEnrichment> = {}): ApolloEnrichment => ({
  contactName: "Wrong Person",
  email: "match@acme.example",
  title: "Facilities Manager",
  linkedinUrl: null,
  phone: null,
  city: null,
  state: null,
  website: null,
  employeeCount: null,
  organizationDescription: null,
  ...overrides,
});

describe("prospect Apollo enrichment merge", () => {
  it("preserves a real contact name when Apollo returns a different name", () => {
    expect(mergeApolloEnrichment(prospect(), apolloPerson()).contactName).toBe("Jamie Rivera");
  });

  it("preserves a real email when Apollo returns a match email", () => {
    expect(mergeApolloEnrichment(prospect(), apolloPerson()).email).toBe("jamie@acme.example");
  });

  it("replaces a .invalid email when Apollo finds a decision-maker", () => {
    const merged = mergeApolloEnrichment(
      prospect({ email: "unknown@acme.invalid" }),
      apolloPerson({ email: "decision-maker@acme.example" }),
    );
    expect(merged.email).toBe("decision-maker@acme.example");
  });

  it('replaces the placeholder contact name "Owner" with Apollo\'s real name', () => {
    const merged = mergeApolloEnrichment(
      prospect({ contactName: "Owner" }),
      apolloPerson({ contactName: "Morgan Lee" }),
    );
    expect(merged.contactName).toBe("Morgan Lee");
  });
});

describe("prospect Apollo enrichment run", () => {
  it("short-circuits the entire run when Apollo reports planBlocked", async () => {
    const rows = [prospect({ id: 1 }), prospect({ id: 2 }), prospect({ id: 3 })];
    const enrich = vi.fn().mockResolvedValue({
      ok: false,
      planBlocked: true,
      error: "Apollo plan unavailable",
    });
    const update = vi.fn();

    const result = await runProspectEnrichment({ rows, enrich, update, concurrency: 1 });

    expect(enrich).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({
      enriched: 0,
      skipped: 0,
      failed: 3,
      planBlocked: true,
      errors: ["Apollo plan unavailable"],
    });
  });
});