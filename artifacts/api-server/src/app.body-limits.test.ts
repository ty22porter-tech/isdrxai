import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
}));
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_parser_boundary",
}));

import app from "./app";
import { WebhookHandlers } from "./webhookHandlers";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => err ? reject(err) : resolve()),
  );
});

function post(path: string, value: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(value);
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body).toString(),
        ...headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : null });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

const categoryKeys = [
  "company_industry_fit",
  "verified_buying_signals",
  "seller_prospect_match",
  "decision_maker_match",
  "signal_freshness",
  "business_need_potential",
] as const;

function researchedLead(index: number, researchBytes = 25_000) {
  return {
    companyName: `Regional Manufacturer ${index}`,
    contactName: "Jamie Rivera",
    email: `jamie${index}@regional.example`,
    website: `https://regional${index}.example`,
    industry: "Manufacturing",
    city: "Columbus",
    state: "OH",
    opportunityIntelligence: {
      version: 3,
      score: 40,
      label: "Possible Fit",
      scoreConfidence: "medium",
      definition: "Server-derived research",
      breakdown: categoryKeys.map((key) => ({
        key,
        label: key,
        points: 0,
        maxPoints: 20,
        explanation: "",
        evidence: [],
      })),
      signals: [],
      whyTarget: "Evidence-backed fit",
      potentialNeeds: [],
      recommendedOutreach: "R".repeat(researchBytes),
      generatedAt: "2025-01-01T00:00:00.000Z",
      itResearch: {
        selectedIndustry: "Manufacturing",
        actualIndustry: "Manufacturing",
        industryRelationship: "match",
        industryExplanation: "Verified from the official site",
        industrySources: [],
        lastResearched: "2025-01-01T00:00:00.000Z",
        warnings: [],
        industryChallenges: [],
        prospectConcerns: [],
        recommendations: [],
      },
      researchProof: "server-signed-proof",
    },
  };
}

describe("real Express JSON parser boundaries", () => {
  it("parses a valid researched enrichment body larger than the old 100 KB boundary", async () => {
    const lead = researchedLead(0, 340_000);
    const encodedBytes = Buffer.byteLength(JSON.stringify({ leads: [lead] }));
    expect(encodedBytes).toBeGreaterThan(335_531);

    const response = await post("/api/ai/enrich-leads", { leads: [lead] });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("parses a realistic full 100-lead research batch", async () => {
    const leads = Array.from({ length: 100 }, (_, index) => researchedLead(index));
    const encodedBytes = Buffer.byteLength(JSON.stringify({ leads }));
    expect(encodedBytes).toBeGreaterThan(2_000_000);

    const response = await post("/api/ai/enrich-leads", { leads });
    expect(response.status).toBe(401);
  });

  it.each([
    ["/api/prospects", () => researchedLead(0, 340_000)],
    ["/api/prospects/bulk", () => ({
      duplicateStrategy: "skip",
      prospects: Array.from({ length: 100 }, (_, index) => researchedLead(index)),
    })],
  ])("parses researched single and bulk save bodies on %s", async (path, payload) => {
    const response = await post(path, payload());
    expect(response.status).toBe(401);
  });

  it("returns a safe actionable 413 when a research request exceeds 8 MB", async () => {
    const response = await post("/api/ai/enrich-leads", {
      leads: [researchedLead(0, 8 * 1024 * 1024)],
    });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "Request payload is too large. Reduce the request size or send fewer researched leads (maximum 100), then try again.",
      code: "payload_too_large",
    });
  });

  it("also converts the ordinary parser's 100 KB overflow into a clean 413", async () => {
    const response = await post("/api/ai/prospect-search", {
      city: "C".repeat(110_000),
      state: "OH",
      industry: "Manufacturing",
      count: 1,
    });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "Request payload is too large. Reduce the request size and try again.",
      code: "payload_too_large",
    });
  });

  it("keeps Stripe webhook JSON as an unparsed raw Buffer", async () => {
    const webhook = vi.spyOn(WebhookHandlers, "processWebhook").mockResolvedValue();
    const payload = { id: "evt_parser_test", type: "customer.updated" };

    const response = await post("/api/stripe/webhook", payload, {
      "stripe-signature": "test-signature",
    });

    expect(response.status).toBe(200);
    expect(webhook).toHaveBeenCalledWith(
      expect.any(Buffer),
      "test-signature",
    );
    expect((webhook.mock.calls[0][0] as Buffer).toString("utf8")).toBe(JSON.stringify(payload));
  });
});