import { researchModelSettings } from "./aiModelSettings";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

export interface CompanyDemographicResearchInput {
  companyName: string;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
}

export interface CompanyDemographicResearchResult {
  employeeCount: number;
  confidence: "high" | "medium";
  explanation: string;
  sourceUrls: string[];
}

const cache = new Map<string, {
  expiresAt: number;
  result?: CompanyDemographicResearchResult;
}>();
const inFlight = new Map<string, Promise<CompanyDemographicResearchResult | undefined>>();

function cacheKey(input: CompanyDemographicResearchInput): string {
  return [
    input.companyName,
    input.website || "",
    input.city || "",
    input.state || "",
  ].map(value => value.trim().toLowerCase()).join("|");
}

function validPublicSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseCompanyDemographicResearchResponse(
  payload: any,
): CompanyDemographicResearchResult | undefined {
  const text = payload?.output
    ?.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .find((item: any) => item?.type === "output_text" && typeof item?.text === "string")
    ?.text;
  if (!text) return undefined;

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return undefined;
    try { parsed = JSON.parse(json); } catch { return undefined; }
  }

  const employeeCount = Number(parsed?.employeeCount);
  const confidence = parsed?.confidence;
  const explanation = typeof parsed?.explanation === "string"
    ? parsed.explanation.replace(/\s+/g, " ").trim().slice(0, 500)
    : "";
  const sourceUrls = [...new Set(
    (payload?.output || [])
      .filter((item: any) => item?.type === "web_search_call")
      .flatMap((item: any) => item?.action?.sources || [])
      .map((source: any) => validPublicSourceUrl(source?.url))
      .filter(Boolean),
  )].slice(0, 5) as string[];

  if (
    !Number.isInteger(employeeCount)
    || employeeCount < 1
    || employeeCount > 10_000_000
    || !["high", "medium"].includes(confidence)
    || !explanation
    || !sourceUrls.length
  ) return undefined;

  return {
    employeeCount,
    confidence,
    explanation,
    sourceUrls,
  };
}

export async function researchCompanyDemographics(
  input: CompanyDemographicResearchInput,
): Promise<CompanyDemographicResearchResult | undefined> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const research = (async () => {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!baseURL || !apiKey) return undefined;
    try {
      const identity = [
        `Company: ${input.companyName}`,
        input.website ? `Official website/domain: ${input.website}` : "",
        input.city || input.state ? `Location: ${[input.city, input.state].filter(Boolean).join(", ")}` : "",
        input.industry ? `Industry: ${input.industry}` : "",
      ].filter(Boolean).join("\n");
      const response = await fetch(`${baseURL}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...researchModelSettings(350),
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"],
          input: `Research the current approximate employee count for this exact organization using public internet sources or public records.

${identity}

Identity safety rules:
- Match the official domain and location where available; do not use a similarly named organization.
- Prefer official company pages, government records, regulatory filings, annual reports, and reputable company-data sources.
- If sources conflict materially, the identity is uncertain, or no defensible estimate exists, return employeeCount null and confidence low.
- Never infer employee count from industry averages, building size, reviews, phone numbers, or search-result popularity.

Return only JSON:
{"employeeCount": integer|null, "confidence":"high"|"medium"|"low", "explanation":"short source-based explanation"}`,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      return parseCompanyDemographicResearchResponse(await response.json());
    } catch {
      return undefined;
    }
  })();
  inFlight.set(key, research);
  try {
    const result = await research;
    cache.set(key, {
      expiresAt: Date.now() + (result ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
      result,
    });
    return result;
  } finally {
    inFlight.delete(key);
  }
}
