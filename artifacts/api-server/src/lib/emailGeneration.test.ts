import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containsInternalWriterInstructions,
  currentSavedRecommendation,
  generateProspectEmailDraft,
  normalizeGeneratedEmail,
} from "./emailGeneration";

const sellerProfile = {
  status: "ready",
  websiteAnalysisStatus: "ready",
  sellerCompanyName: "Northstar Technology",
  sellerServices: [],
  sellerProducts: [],
  sellerCapabilities: ["network monitoring"],
  sellerDifferentiators: [],
  sellerCertifications: [],
  sellerIndustriesServed: [],
  sellerBusinessOutcomes: ["more reliable business operations"],
  sellerProblemsSolved: [],
  sellerProofPoints: [],
  sellerPortfolioExamples: [],
  sellerValuePropositions: [],
  sellerTypicalCustomers: [],
  sellerCTAs: [],
  userOverrides: { sellerServices: ["managed IT support"] },
  researchStatus: "ready",
  researchGenerated: {
    sellerServices: ["managed IT support"],
    sellerProducts: [],
    sellerCapabilities: ["network monitoring"],
    sellerValuePropositions: [],
  },
};

const client = {
  businessName: "Northstar Technology",
  senderName: "Taylor",
  vertical: "it_services",
  sellerIntelligenceProfile: sellerProfile,
} as any;

const recommendation = {
  concernId: "support-risk",
  prospectConcern: "Support continuity may become harder as the team grows",
  offering: "managed IT support",
  howItHelps: "It could centralize support and make recurring issues easier to handle.",
  businessValue: "That may protect staff time and operational continuity.",
  outreachAngle: "Focus on support continuity; Outreach angle: mention the growth concern.",
  discoveryQuestion: "How are support requests handled today?",
  sellerEvidence: {
    availability: "user_approved",
    basis: "Saved Settings approval",
    sources: [],
  },
};

const concern = {
  id: "support-risk",
  title: "Support continuity may become harder as the team grows",
  explanation: "This is an industry-based possibility, not a confirmed company problem.",
  businessImpact: "Support delays could consume staff time if the possibility is confirmed.",
  evidence: "The cited industry source describes this operating pattern.",
  classification: "Industry-Based Possibility",
  confidence: "low",
  sources: [{ title: "Industry source", url: "https://example.com/industry" }],
};

const prospect = {
  companyName: "Harbor Health",
  contactName: "Jordan Ellis",
  industry: "Healthcare",
  city: "Dallas",
  state: "TX",
  opportunityIntelligence: {
    itResearch: {
      actualIndustry: "Healthcare",
      prospectConcerns: [concern],
      recommendations: [recommendation],
    },
    signals: [],
  },
} as any;

function modelResponse(subject: string, body: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ subject, body }) } }],
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("current saved recommendation validation", () => {
  it("rejects a saved offering that is no longer in the current seller catalog", () => {
    const stale = {
      ...prospect.opportunityIntelligence,
      itResearch: {
        ...prospect.opportunityIntelligence.itResearch,
        recommendations: [{ ...recommendation, offering: "stale unsupported service" }],
      },
    };
    expect(currentSavedRecommendation(stale, client)).toBeUndefined();
  });

  it("returns the current catalog evidence instead of trusting saved evidence", () => {
    const savedWithStaleEvidence = {
      ...recommendation,
      sellerEvidence: {
        availability: "source_backed",
        sources: [{ title: "Stale source", url: "https://stale.example.com" }],
      },
    };
    const result = currentSavedRecommendation({
      ...prospect.opportunityIntelligence,
      itResearch: {
        ...prospect.opportunityIntelligence.itResearch,
        recommendations: [savedWithStaleEvidence],
      },
    }, client);
    expect(result?.offering).toBe("managed IT support");
    expect(result?.sellerEvidence).not.toEqual(savedWithStaleEvidence.sellerEvidence);
    expect(result?.sellerEvidence.availability).toBe("user_approved");
  });
});

describe("AI prospect email writer", () => {
  it("composes from the validated recommendation without returning internal outreach directives", async () => {
    const body = `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. If Harbor Health is reviewing support continuity, Northstar Technology's managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`;
    const fetchMock = vi.fn().mockResolvedValue(modelResponse("A support question for Harbor Health", body));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    const result = await generateProspectEmailDraft(prospect, client);
    expect(result.body).toBe(body);
    expect(result.body).not.toContain("Focus on");
    expect(result.body).not.toContain("Outreach angle:");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("gpt-6-astra");
    expect(request.reasoning_effort).toBe("medium");
    expect(request.max_completion_tokens).toBeGreaterThan(8192);
    expect(request).not.toHaveProperty("temperature");
    expect(request.messages[0].content).toContain("enthusiastic human tone");
    expect(request.messages[0].content).toContain("managed IT support");
    expect(request.messages[0].content).toContain("Industry-Based Possibility");
    expect(request.messages[0].content).toContain("Northstar Technology");
    expect(request.messages[0].content).not.toContain("Focus on support continuity");
    expect(containsInternalWriterInstructions(result.body)).toBe(false);
  });

  it("rewrites a screenshot-style/internal instruction once and keeps a possibility conditional", async () => {
    const revisedBody = `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. If Harbor Health is reviewing support continuity, managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelResponse(
        "Support continuity for Harbor Health",
        "Hi Jordan,\n\nFocus on: support continuity. Outreach angle: mention the saved concern.\n\nWould you be open to a call?",
      ))
      .mockResolvedValueOnce(modelResponse("A support question for Harbor Health", revisedBody));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    const result = await generateProspectEmailDraft(prospect, client);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.regenerated).toBe(true);
    expect(result.body).toBe(revisedBody);
    expect(result.body).not.toMatch(/Focus on|Outreach angle:|classification:/i);
    expect(result.body).toMatch(/\bmay\b|\bcould\b|\bif\b/i);
    expect((result.body.match(/\?/g) ?? [])).toHaveLength(1);
  });

  it("requires a greeting line containing only the contact's first name", async () => {
    const validBody = `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. If Harbor Health is reviewing support continuity, managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelResponse(
        "A support question for Harbor Health",
        `Hi Jordan Ellis,

Healthcare teams may need reliable support as their day-to-day systems grow. Managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`,
      ))
      .mockResolvedValueOnce(modelResponse("A support question for Harbor Health", validBody));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    const result = await generateProspectEmailDraft(prospect, client);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).toBe(validBody);
  });

  it("requires the exact validated recommendation offering even when another catalog capability is present", async () => {
    const validBody = `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. If Harbor Health is reviewing support continuity, managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelResponse(
        "A support question for Harbor Health",
        `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. Network monitoring could support recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`,
      ))
      .mockResolvedValueOnce(modelResponse("A support question for Harbor Health", validBody));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    const result = await generateProspectEmailDraft(prospect, client);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).toContain("managed IT support");
    expect(result.body).not.toMatch(/Network monitoring/i);
  });

  it("rejects contact URLs and sign-offs before the CTA, and normalizes Kind regards at the end", async () => {
    const validBody = `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. If Harbor Health is reviewing support continuity, managed IT support could centralize recurring requests and protect staff time.

Would it be useful to compare how support requests are handled today?`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelResponse(
        "A support question for Harbor Health",
        `Hi Jordan,

Healthcare teams may need reliable support as their day-to-day systems grow. Managed IT support could centralize recurring requests and protect staff time.

Kind regards,
Taylor
https://example.com/contact
Would it be useful to compare how support requests are handled today?`,
      ))
      .mockResolvedValueOnce(modelResponse("A support question for Harbor Health", validBody));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    const result = await generateProspectEmailDraft(prospect, client);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).toBe(validBody);
    expect(normalizeGeneratedEmail(
      "Hi Jordan,\n\nWould it be useful to compare notes?\n\nKind regards,\nTaylor",
      "Fallback",
      false,
    ).body).not.toMatch(/kind regards|Taylor/i);
  });

  it("recognizes all research labels as internal writer instructions", () => {
    for (const label of [
      "Potential business value:",
      "Exact current seller offering:",
      "Concern evidence:",
      "Current seller evidence status:",
      "Current seller evidence sources:",
      "Saved discovery question:",
    ]) {
      expect(containsInternalWriterInstructions(`Hi Jordan,\n\n${label} internal data`)).toBe(true);
    }
  });

  it("passes researched industry challenges as optional conditional background with a natural appointment directive", async () => {
    const researchedProspect = {
      ...prospect,
      opportunityIntelligence: {
        ...prospect.opportunityIntelligence,
        itResearch: {
          ...prospect.opportunityIntelligence.itResearch,
          actualIndustry: "Healthcare",
          industryRelationship: "match",
          industryChallenges: [{
            title: "Care teams need dependable systems",
            explanation: "Healthcare organizations may need reliable access as patient-service workflows grow.",
            businessImpact: "Delays could make staff time harder to protect.",
            sources: [{ title: "Industry source", url: "https://example.com/healthcare" }],
          }],
        },
      },
    } as any;
    const body = `Hi Jordan,

Healthcare organizations may need reliable access as patient-service workflows grow. Managed IT support could help protect staff time and keep support requests moving.

Would it be worth a short conversation about how your team handles this today?`;
    const fetchMock = vi.fn().mockResolvedValue(modelResponse("A support question for Harbor Health", body));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    await generateProspectEmailDraft(researchedProspect, client);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = request.messages.map((message: { content: string }) => message.content).join("\n");
    expect(prompt).toContain("RESEARCHED INDUSTRY CHALLENGES");
    expect(prompt).toContain("Care teams need dependable systems");
    expect(prompt).toContain("general patterns, not verified prospect conditions");
    expect(prompt).toMatch(/warm|plain words|low-pressure question|short, relevant appointment/i);
    expect(prompt).toContain("Do not invent meeting dates");
  });

  it("does not carry selected-industry challenges into a mismatched prospect's email context", async () => {
    const mismatchedProspect = {
      ...prospect,
      industry: "Consulting",
      opportunityIntelligence: {
        ...prospect.opportunityIntelligence,
        itResearch: {
          ...prospect.opportunityIntelligence.itResearch,
          selectedIndustry: "Manufacturing",
          actualIndustry: "Consulting",
          industryRelationship: "mismatch",
          industryChallenges: [{
            title: "Manufacturing throughput risk",
            explanation: "Production floors may need resilient systems.",
            businessImpact: "Downtime could affect throughput.",
            sources: [{ title: "Industry source", url: "https://example.com/manufacturing" }],
          }],
        },
      },
    } as any;
    const body = `Hi Jordan,

Consulting teams may benefit from reliable support as client work changes. Managed IT support could help protect staff time.

Would a short conversation about your current support approach be useful?`;
    const fetchMock = vi.fn().mockResolvedValue(modelResponse("Support for Harbor Health", body));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://model.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-key");

    await generateProspectEmailDraft(mismatchedProspect, client);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = request.messages.map((message: { content: string }) => message.content).join("\n").toLowerCase();
    expect(prompt).not.toContain("manufacturing throughput risk");
    expect(prompt).not.toContain("production floors");
    expect(prompt).toContain("researched actual industry");
    expect(prompt).toContain("consulting");
  });
});