import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const prospectsTable = { id: "prospect.id", clientId: "prospect.clientId", giftSuggestions: "prospect.giftSuggestions" };
  const usersTable = { id: "user.id" };
  const state = {
    prospects: [] as any[],
    users: [] as any[],
    updated: null as any,
  };
  const query = (rows: () => any[]) => {
    const chain: any = {
      where: () => chain,
      returning: () => chain,
      then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows()).then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: (shape?: object) => ({
      from: (table: object) => query(() => {
        const rows = table === prospectsTable ? state.prospects : state.users;
        return shape ? rows.map(row => ({ giftSuggestions: row.giftSuggestions ?? null })) : rows;
      }),
    }),
    update: () => ({
      set: (patch: object) => {
        state.updated = patch;
        return { where: () => ({ returning: () => query(() => state.prospects.length ? [{ id: state.prospects[0].id }] : []) }) };
      },
    }),
  };
  return { state, db, prospectsTable, usersTable };
});
const geminiGenerate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: fake.db,
  prospectsTable: fake.prospectsTable,
  usersTable: fake.usersTable,
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (...values: unknown[]) => values }));
vi.mock("@workspace/integrations-gemini-ai", () => ({
  getGeminiClient: () => ({ models: { generateContent: geminiGenerate } }),
}));
vi.mock("./giftOutreach", () => ({
  GiftOutreachError: class GiftOutreachError extends Error {
    constructor(message: string, public status = 409) { super(message); }
  },
}));

import {
  buildGiftSuggestionPrompt,
  generateGiftSuggestions,
  previewGiftSuggestions,
  requestProspectGiftResearch,
  validateGiftSuggestionOutput,
  validateProspectGiftResearch,
} from "./giftSuggestions";

const validOutput = JSON.stringify({
  ideas: [
    { name: "Desk organizer", description: "A compact office organizer.", estimatedPriceMinUsd: 12, estimatedPriceMaxUsd: 20, whyFit: "Neutral utility for a professional desk.", personalization: "generic_fallback", evidenceFactIds: [] },
    { name: "Reusable notebook", description: "A reusable notebook for work notes.", estimatedPriceMinUsd: 15, estimatedPriceMaxUsd: 25, whyFit: "Useful for meetings and planning.", personalization: "generic_fallback", evidenceFactIds: [] },
    { name: "Team snack box", description: "A modest shareable office snack box.", estimatedPriceMinUsd: 18, estimatedPriceMaxUsd: 25, whyFit: "A team-oriented option for the office.", personalization: "generic_fallback", evidenceFactIds: [] },
  ],
});

const emptyResearch = { output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: '{"facts":[]}' };

function researchPayload(facts: any[]) {
  const sources = facts.map((fact, index) => ({ title: `Source ${index + 1}`, url: fact.url }));
  return {
    output: [{ type: "web_search_call", status: "completed", action: { sources } }],
    output_text: JSON.stringify({ facts }),
  };
}

beforeEach(() => {
  geminiGenerate.mockReset();
  vi.unstubAllGlobals();
  fake.state.prospects = [{
    id: 7,
    clientId: "tenant-a",
    contactName: "Jamie Rivera",
    companyName: "Acme",
    industry: "Manufacturing",
    title: "Operations Director",
    city: "Columbus",
    state: "OH",
    opportunityIntelligence: null,
  }];
  fake.state.users = [{ id: "tenant-a", businessName: "Seller Co", vertical: "janitorial" }];
  fake.state.updated = null;
});

describe("prospect gift suggestions", () => {
  it("rejects an out-of-range budget before calling the provider", async () => {
    const provider = vi.fn();
    await expect(generateGiftSuggestions("tenant-a", 7, 101, provider, vi.fn())).rejects.toMatchObject({ status: 400 });
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not generate for a prospect outside the tenant scope", async () => {
    fake.state.prospects = [];
    const provider = vi.fn();
    await expect(generateGiftSuggestions("tenant-b", 7, 25, provider, vi.fn())).rejects.toMatchObject({ status: 404 });
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns a safe provider error and does not persist", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("secret upstream details"));
    await expect(generateGiftSuggestions("tenant-a", 7, 25, provider, vi.fn().mockResolvedValue(emptyResearch))).rejects.toMatchObject({
      status: 502,
      message: "Gift suggestion generation is temporarily unavailable. Please try again.",
    });
    expect(fake.state.updated).toBeNull();
  });

  it("reports incomplete research as a retryable failure instead of hiding it as no match", async () => {
    const provider = vi.fn();
    await expect(generateGiftSuggestions(
      "tenant-a",
      7,
      25,
      provider,
      vi.fn().mockResolvedValue({ output_text: "not json", output: [] }),
    )).rejects.toMatchObject({
      status: 502,
      message: "Prospect research returned an incomplete result. Please retry.",
    });
    expect(provider).not.toHaveBeenCalled();
    expect(fake.state.updated).toBeNull();
  });

  it("rejects malformed, over-budget, URL, and prohibited provider output", () => {
    expect(() => validateGiftSuggestionOutput("not json", 25)).toThrow("invalid gift suggestions");
    expect(() => validateGiftSuggestionOutput(validOutput.replace('"estimatedPriceMaxUsd":20', '"estimatedPriceMaxUsd":30'), 25)).toThrow("budget or gift policy");
    expect(() => validateGiftSuggestionOutput(validOutput.replace("Desk organizer", "Wine from example.com"), 25)).toThrow("budget or gift policy");
  });

  it("persists only validated ideas without changing any gift record or send state", async () => {
    const result = await generateGiftSuggestions(
      "tenant-a",
      7,
      25,
      vi.fn().mockResolvedValue(validOutput),
      vi.fn().mockResolvedValue(emptyResearch),
    );
    expect(result).toMatchObject({ budgetUsd: 25, ideas: expect.arrayContaining([expect.objectContaining({ name: "Desk organizer" })]) });
    expect(result).toMatchObject({ researchStatus: "no_public_match", researchFacts: [] });
    expect(fake.state.updated).toEqual({ giftSuggestions: result });
  });

  it("generates an unsaved preview without creating or updating a prospect or gift record", async () => {
    const result = await previewGiftSuggestions(
      "tenant-a",
      {
        budgetUsd: 25,
        contactName: "Jamie Rivera",
        companyName: "Acme",
        industry: "Manufacturing",
        title: "Operations Director",
        city: "Columbus",
        state: "OH",
      },
      vi.fn().mockResolvedValue(validOutput),
      vi.fn().mockResolvedValue(emptyResearch),
    );
    expect(result).toMatchObject({ budgetUsd: 25, researchStatus: "no_public_match" });
    expect(fake.state.updated).toBeNull();
  });

  it("uses honestly labeled alternate public-web research when Gemini omits grounding metadata", async () => {
    geminiGenerate.mockResolvedValue({ text: "ungrounded response", candidates: [{ content: {} }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(researchPayload([{
      type: "education",
      classification: "degree",
      summary: "Jamie Rivera earned a bachelor's degree from State University.",
      evidence: "Jamie Rivera, Acme Operations Director in Columbus, earned a bachelor's degree from State University.",
      identityEvidence: "Jamie Rivera is Acme Operations Director in Columbus.",
      url: "https://example.org/public-bio",
      identity: { nameMatched: true, companyMatched: true, roleOrLocationMatched: true },
      publiclyStatedByProspect: false,
    }])), { status: 200, headers: { "Content-Type": "application/json" } })));
    const payload = await requestProspectGiftResearch(
      { name: "Jamie Rivera", company: "Acme", role: "Operations Director", location: "Columbus, OH" },
      "janitorial",
      "2026-01-02T00:00:00.000Z",
    );
    expect(payload.researchProvider).toBe("openai_web_search_legacy");
    expect(validateProspectGiftResearch(payload, "2026-01-02T00:00:00.000Z", {
      name: "Jamie Rivera", company: "Acme", role: "Operations Director", location: "Columbus, OH",
    })).toHaveLength(1);
  });

  it("treats a malformed alternate response as research unavailable instead of a generation 502", async () => {
    geminiGenerate.mockResolvedValue({ text: "ungrounded response", candidates: [{ content: {} }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: "not valid research json",
      output: [{ type: "web_search_call", status: "incomplete" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const payload = await requestProspectGiftResearch(
      { name: "Jamie Rivera", company: "Acme", role: "Operations Director", location: "Columbus, OH" },
      "janitorial",
      "2026-01-02T00:00:00.000Z",
    );
    expect(payload).toMatchObject({ researchUnavailable: true, outputText: '{"facts":[]}' });

    const result = await previewGiftSuggestions(
      "tenant-a",
      {
        budgetUsd: 25,
        contactName: "Jamie Rivera",
        companyName: "Acme",
        industry: "Manufacturing",
        title: "Operations Director",
      },
      vi.fn().mockResolvedValue(validOutput),
      vi.fn().mockResolvedValue(payload),
    );
    expect(result.researchStatus).toBe("research_unavailable");
    expect(result.ideas).toHaveLength(3);
  });

  it("classifies grounded affiliation before college words, preserves finalist status, and drops only an overlong support", async () => {
    const identityText = "Jamie Rivera, Acme Operations Director in Columbus";
    geminiGenerate.mockResolvedValue({
      text: "grounded public facts",
      candidates: [{ groundingMetadata: {
        webSearchQueries: ["Jamie Rivera Acme public bio"],
        groundingChunks: [
          { web: { uri: "https://example.org/bio", title: "Public bio" } },
          { web: { uri: "https://example.org/awards", title: "Awards" } },
        ],
        groundingSupports: [
          {
            segment: { text: `${identityText}, is a university alumna and public sorority chapter member.` },
            groundingChunkIndices: [0],
          },
          {
            segment: { text: `${identityText}, was an award finalist among prior award winners.` },
            groundingChunkIndices: [1],
          },
          {
            segment: { text: `${identityText}, earned a bachelor's degree. ${"x".repeat(301)}` },
            groundingChunkIndices: [0],
          },
        ],
      } }],
    });
    const identity = { name: "Jamie Rivera", company: "Acme", role: "Operations Director", location: "Columbus, OH" };
    const payload = await requestProspectGiftResearch(identity, "janitorial", "2026-01-02T00:00:00.000Z");
    const facts = validateProspectGiftResearch(payload, "2026-01-02T00:00:00.000Z", identity);
    expect(facts.map(fact => fact.classification)).toEqual(["public_affiliation", "nominee_finalist"]);
  });

  it("returns honest general ideas when both public research providers are unavailable", async () => {
    const result = await previewGiftSuggestions(
      "tenant-a",
      {
        budgetUsd: 25,
        contactName: "Jamie Rivera",
        companyName: "Acme",
        industry: "Manufacturing",
        title: "Operations Director",
        city: "Columbus",
        state: "OH",
      },
      vi.fn().mockResolvedValue(validOutput),
      vi.fn().mockResolvedValue({
        outputText: '{"facts":[]}',
        groundingChunks: [],
        groundingSupports: [],
        researchUnavailable: true,
      }),
    );
    expect(result.researchStatus).toBe("research_unavailable");
    expect(result.researchMessage).toContain("providers were unavailable");
    expect(result.researchFacts).toEqual([]);
    expect(result.ideas.every(idea => idea.personalization === "generic_fallback")).toBe(true);
  });

  it("keeps identity-matched evidence and distinguishes nomination from a win", () => {
    const facts = validateProspectGiftResearch(researchPayload([
      {
        type: "award",
        classification: "nominee_finalist",
        summary: "Jamie Rivera was named a 2024 ORBIE finalist.",
        evidence: "Jamie Rivera, Acme Operations Director in Columbus, was named a 2024 ORBIE finalist.",
        url: "https://example.org/orbie-finalists",
        identity: { nameMatched: true, companyMatched: true, roleOrLocationMatched: true },
        publiclyStatedByProspect: false,
      },
      {
        type: "education",
        classification: "degree",
        summary: "Jamie earned a bachelor’s degree from State University.",
        evidence: "They earned a bachelor’s degree from State University.",
        identityEvidence: "Jamie Rivera is Operations Director at Acme in Columbus.",
        url: "https://example.org/executive-bio",
        identity: { nameMatched: true, companyMatched: true, roleOrLocationMatched: true },
        publiclyStatedByProspect: false,
      },
    ]), "2026-01-02T00:00:00.000Z", {
      name: "Jamie Rivera",
      company: "Acme",
      role: "Operations Director",
      location: "Columbus, OH",
    });
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        classification: "nominee_finalist",
        checkedAt: "2026-01-02T00:00:00.000Z",
        url: "https://example.org/orbie-finalists",
      }),
      expect.objectContaining({
        classification: "degree",
        url: "https://example.org/executive-bio",
      }),
    ]));
  });

  it("rejects same-name ambiguity, inferred hobbies, sensitive facts, and membership presented as an award", () => {
    const base = {
      url: "https://example.org/profile",
      identity: { nameMatched: true, companyMatched: true, roleOrLocationMatched: true },
      publiclyStatedByProspect: false,
    };
    const facts = validateProspectGiftResearch(researchPayload([
      { ...base, type: "education", classification: "degree", summary: "Alex earned a bachelor's degree.", evidence: "Alex earned a bachelor's degree.", identity: { ...base.identity, companyMatched: false } },
      { ...base, type: "hobby", classification: "public_hobby", summary: "Alex likely enjoys golf.", evidence: "Alex likely enjoys golf.", publiclyStatedByProspect: true },
      { ...base, type: "hobby", classification: "public_hobby", summary: "Alex enjoys a religious activity.", evidence: "Alex enjoys a religious activity.", publiclyStatedByProspect: true },
      { ...base, type: "award", classification: "award_winner", summary: "Alex is an IFMA member.", evidence: "Alex is an IFMA member." },
    ]), "2026-01-02T00:00:00.000Z");
    expect(facts).toEqual([]);
  });

  it("accepts a public affiliation only from a cited Google grounding support and declines unsupported ambiguity", () => {
    const fact = {
      type: "affiliation",
      classification: "public_affiliation",
      summary: "Jamie Rivera is a public alumna member of Alpha Example Sorority.",
      evidence: "Jamie Rivera, Acme Operations Director in Columbus, is an alumna member of Alpha Example Sorority.",
      identityEvidence: "Jamie Rivera is Acme Operations Director in Columbus.",
      sourceIndex: 0,
      identity: { nameMatched: true, companyMatched: true, roleOrLocationMatched: true },
      publiclyStatedByProspect: false,
    };
    const payload = {
      outputText: JSON.stringify({ facts: [fact] }),
      groundingChunks: [{ web: { uri: "https://example.org/public-chamber-bio", title: "Public chamber bio" } }],
      groundingSupports: [{ groundingChunkIndices: [0] }],
    };
    const identity = { name: "Jamie Rivera", company: "Acme", role: "Operations Director", location: "Columbus, OH" };
    expect(validateProspectGiftResearch(payload, "2026-01-02T00:00:00.000Z", identity)).toEqual([
      expect.objectContaining({ type: "affiliation", classification: "public_affiliation", url: "https://example.org/public-chamber-bio" }),
    ]);
    expect(validateProspectGiftResearch({ ...payload, groundingSupports: [] }, "2026-01-02T00:00:00.000Z", identity)).toEqual([]);
  });

  it("requires personalized output to cite verified fact ids and labels no-match fallback", () => {
    const facts = [{
      id: "fact-1",
      type: "education" as const,
      classification: "degree" as const,
      summary: "Jamie earned a bachelor's degree from State University.",
      evidence: "Jamie earned a bachelor's degree from State University.",
      url: "https://example.org/bio",
      checkedAt: "2026-01-02T00:00:00.000Z",
    }];
    const personalized = JSON.parse(validOutput);
    personalized.ideas = personalized.ideas.map((idea: any, index: number) => ({
      ...idea,
      name: `State University personalized item ${index + 1}`,
      whyFit: "Grounded in the confirmed State University degree.",
      personalization: "verified_fact",
      evidenceFactIds: ["fact-1"],
    }));
    expect(validateGiftSuggestionOutput(JSON.stringify(personalized), 25, facts)[0].personalization).toBe("verified_fact");
    personalized.ideas[0].evidenceFactIds = ["invented"];
    expect(() => validateGiftSuggestionOutput(JSON.stringify(personalized), 25, facts)).toThrow("not meet");
  });

  it("builds a prompt that permits sourced hobbies and college goods without permitting guesses", () => {
    const prompt = buildGiftSuggestionPrompt({
      prospect: { name: "Jamie Rivera", company: "Acme", industry: "Manufacturing", role: "Director", location: "Columbus, OH" },
      researchFacts: [],
      legitimateOpportunityContext: null,
      seller: { company: "Seller", vertical: "it_services" },
    }, 50);
    expect(prompt).toContain("college-branded tumbler");
    expect(prompt).toContain('every idea must be explicitly generic_fallback');
    expect(prompt).toContain("nonsensitive hobby gift");
    expect(prompt).toContain("public_affiliation");
  });
});