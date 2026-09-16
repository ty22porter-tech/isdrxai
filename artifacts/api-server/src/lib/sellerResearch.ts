import { db, usersTable } from "@workspace/db";
import type { SellerIntelligenceEditable, SellerIntelligenceProfile, User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  SELLER_RESEARCH_VERSION,
  SellerIntelligenceProfileSchema,
  applySellerIntelligenceSources,
  buildGenericSellerProfile,
} from "./sellerIntelligence";

/**
 * Seller research is deliberately separate from target-company research. The
 * seller's Your Industry setting is the vertical lens for this search; a
 * prospect's industry and website are never used as seller evidence.
 */
export const SELLER_RESEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SELLER_RESEARCH_FAILURE_RETRY_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_SOURCES = 20;

export interface SellerResearchSource {
  title: string;
  url: string;
  publishedDate?: string | null;
}

export interface SellerResearchInput {
  companyName: string;
  vertical: string;
  website?: string | null;
  differentiatorsInput?: string | null;
  servicePriorities?: string | null;
}

type SellerResearchPayload = {
  identityStatus: "confirmed" | "ambiguous" | "not_found";
  resolvedCompanyName?: string | null;
  identityAliases?: unknown;
  identityExplanation?: string;
  officialSourceUrls?: string[];
  identitySourceUrls?: string[];
  sourceUrls?: string[];
  sellerCompanyName?: string | null;
  sellerServices?: unknown;
  sellerProducts?: unknown;
  sellerCapabilities?: unknown;
  sellerDifferentiators?: unknown;
  sellerCertifications?: unknown;
  sellerIndustriesServed?: unknown;
  sellerBusinessOutcomes?: unknown;
  sellerProblemsSolved?: unknown;
  sellerProofPoints?: unknown;
  sellerPortfolioExamples?: unknown;
  sellerValuePropositions?: unknown;
  sellerTypicalCustomers?: unknown;
  sellerCTAs?: unknown;
  facts?: Partial<Record<keyof SellerIntelligenceEditable, unknown>>;
  /** Per-value evidence map. A value is usable only when its URLs are
   * present in a completed web-search tool result. */
  factEvidence?: Record<string, unknown>;
  /** Explicit mapping between an identity name and the URLs that establish
   * that identity. */
  identitySourceMap?: Record<string, unknown>;
};

type ResearchSourceWithIdentity = SellerResearchSource & { likelyOfficial: boolean };

const sellerResearchCache = new Map<string, { expiresAt: number; profile: SellerIntelligenceProfile }>();
const sellerResearchInFlight = new Map<string, Promise<User>>();

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function sellerResearchCacheKey(clientId: string, companyName: string, vertical: string): string {
  return [
    clientId,
    SELLER_RESEARCH_VERSION,
    normalized(companyName),
    normalized(vertical),
  ].join("|");
}

export function sellerResearchIdentity(companyName: string, vertical: string) {
  return { companyName: companyName.trim(), vertical: vertical.trim() };
}

export function sellerResearchSameCompany(profile: SellerIntelligenceProfile | null | undefined, companyName: string): boolean {
  if (!profile) return false;
  const priorName = profile.researchIdentity?.companyName || profile.sellerCompanyName;
  return Boolean(
    (priorName && normalized(priorName) === normalized(companyName))
    || profile.researchIdentity?.aliases?.some(alias => normalized(alias) === normalized(companyName)),
  );
}

export function researchedIdentityMatchesPrior(
  researched: SellerIntelligenceProfile,
  prior: SellerIntelligenceProfile | null | undefined,
): boolean {
  if (!prior) return false;
  const priorNames = [
    prior.researchIdentity?.companyName,
    prior.sellerCompanyName,
    ...(prior.researchIdentity?.aliases ?? []),
  ].filter((value): value is string => Boolean(value));
  const newNames = [
    researched.researchIdentity?.companyName,
    researched.sellerCompanyName,
    ...(researched.researchIdentity?.aliases ?? []),
  ].filter((value): value is string => Boolean(value));
  return priorNames.some(priorName => newNames.some(newName => normalized(priorName) === normalized(newName)));
}

/**
 * Compare the exact Settings snapshot used to start a researched write.
 * Settings keeps the result only when the canonical identity and profile are
 * unchanged while the web request was in flight.
 */
export function sellerResearchWriteSnapshotMatches(
  current: {
    businessName?: string | null;
    vertical?: string | null;
    sellerIntelligenceProfile?: unknown;
  },
  before: {
    businessName?: string | null;
    vertical?: string | null;
    sellerIntelligenceProfile?: unknown;
  },
): boolean {
  return (current.businessName ?? "").trim().toLowerCase() === (before.businessName ?? "").trim().toLowerCase()
    && (current.vertical ?? "") === (before.vertical ?? "")
    && JSON.stringify(current.sellerIntelligenceProfile) === JSON.stringify(before.sellerIntelligenceProfile);
}

export function sellerResearchIsCurrent(
  profile: SellerIntelligenceProfile | null | undefined,
  companyName: string,
  vertical: string,
  now = Date.now(),
): boolean {
  if (!profile || profile.researchVersion !== SELLER_RESEARCH_VERSION) return false;
  if (profile.researchStatus !== "ready" && profile.researchStatus !== "limited") return false;
  if (!profile.researchIdentity
    || normalized(profile.researchIdentity.companyName) !== normalized(companyName)
    || normalized(profile.researchIdentity.vertical) !== normalized(vertical)) return false;
  const analyzedAt = Date.parse(profile.researchLastAnalyzed || profile.websiteLastAnalyzed);
  return Number.isFinite(analyzedAt) && analyzedAt + SELLER_RESEARCH_TTL_MS > now;
}

function sellerResearchFailureIsRecent(
  profile: SellerIntelligenceProfile | null | undefined,
  companyName: string,
  vertical: string,
  now = Date.now(),
): boolean {
  if (!profile || profile.researchVersion !== SELLER_RESEARCH_VERSION || profile.researchStatus !== "failed") return false;
  if (!profile.researchIdentity
    || normalized(profile.researchIdentity.companyName) !== normalized(companyName)
    || normalized(profile.researchIdentity.vertical) !== normalized(vertical)) return false;
  const attemptedAt = Date.parse(profile.researchLastAnalyzed || profile.lastAnalysisAttemptAt || "");
  return Number.isFinite(attemptedAt) && attemptedAt + SELLER_RESEARCH_FAILURE_RETRY_MS > now;
}

function clean(value: unknown, max = 700): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/\s+/g, " ").trim().slice(0, max);
  return result || undefined;
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

function safePublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function publicDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function outputText(payload: any): string | undefined {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return payload?.output
    ?.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .find((item: any) => item?.type === "output_text" && typeof item?.text === "string")
    ?.text;
}

function outputJson(payload: any): SellerResearchPayload | undefined {
  const text = outputText(payload);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as SellerResearchPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/)?.[0];
    if (!match) return undefined;
    try { return JSON.parse(match) as SellerResearchPayload; } catch { return undefined; }
  }
}

function companyTokens(companyName: string): string[] {
  return normalized(companyName)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(token => token.length >= 3 && !/^(?:inc|llc|ltd|co|corp|corporation|company|the|and)$/i.test(token));
}

function likelyOfficialSource(source: SellerResearchSource, companyNames: string[]): boolean {
  const tokens = companyNames.flatMap(companyTokens);
  if (!tokens.length) return false;
  try {
    const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, "");
    // Titles are model-controlled metadata and are not identity evidence.
    // Only a company-related host can satisfy the official-host check.
    return tokens.some(token => host.includes(token));
  } catch {
    return false;
  }
}

function completedWebSearchSources(payload: any, companyName: string): ResearchSourceWithIdentity[] {
  const entries = payload?.output
    ?.filter((item: any) => item?.type === "web_search_call" && item?.status === "completed")
    .flatMap((item: any) => item?.action?.sources ?? []) ?? [];
  const seen = new Set<string>();
  return entries.flatMap((source: any) => {
    const url = safePublicUrl(source?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const parsed: SellerResearchSource = {
      title: clean(source?.title, 200) || new URL(url).hostname,
      url,
      publishedDate: publicDate(source?.published_date ?? source?.publishedDate),
    };
    return [{ ...parsed, likelyOfficial: likelyOfficialSource(parsed, [companyName]) }];
  }).slice(0, MAX_SOURCES);
}

function listedUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => safePublicUrl(typeof item === "string" ? item : item?.url) || []);
}

function normalizedSourceUrl(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

function factEvidenceUrls(
  result: SellerResearchPayload,
  fieldName: string,
  value: string,
  sourceByUrl: Map<string, ResearchSourceWithIdentity>,
): string[] {
  const fieldEvidence = result.factEvidence?.[fieldName];
  const valueKey = normalized(value);
  let raw: unknown;
  if (Array.isArray(fieldEvidence)) {
    const matching = fieldEvidence.find(item => {
      if (!item || typeof item !== "object") return false;
      const candidate = (item as any).value;
      return typeof candidate === "string" && normalized(candidate) === valueKey;
    }) as any;
    raw = matching?.sourceUrls ?? matching?.urls ?? matching?.sources;
  } else if (fieldEvidence && typeof fieldEvidence === "object") {
    const record = fieldEvidence as Record<string, unknown>;
    raw = record[value] ?? Object.entries(record).find(([key]) => normalized(key) === valueKey)?.[1];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      raw = (raw as any).sourceUrls ?? (raw as any).urls ?? (raw as any).sources;
    }
  }
  const urls = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return urls
    .map(url => safePublicUrl(typeof url === "string" ? url : (url as any)?.url))
    .filter((url): url is string => Boolean(url))
    .map(normalizedSourceUrl)
    .filter(url => sourceByUrl.has(url));
}

function factsFromResult(
  result: SellerResearchPayload,
  sourceByUrl: Map<string, ResearchSourceWithIdentity>,
): SellerIntelligenceEditable {
  const facts = result.facts ?? {};
  const field = (key: keyof SellerIntelligenceEditable) => facts[key] ?? result[key];
  const supportedStrings = (key: keyof SellerIntelligenceEditable, max: number) => strings(field(key), max)
    .filter(value => factEvidenceUrls(result, key, value, sourceByUrl).length > 0);
  return {
    sellerCompanyName: clean(result.resolvedCompanyName || result.sellerCompanyName, 160) || null,
    sellerServices: supportedStrings("sellerServices", 16),
    sellerProducts: supportedStrings("sellerProducts", 16),
    sellerCapabilities: supportedStrings("sellerCapabilities", 16),
    sellerDifferentiators: supportedStrings("sellerDifferentiators", 16),
    sellerCertifications: supportedStrings("sellerCertifications", 16),
    sellerIndustriesServed: supportedStrings("sellerIndustriesServed", 16),
    sellerBusinessOutcomes: supportedStrings("sellerBusinessOutcomes", 16),
    sellerProblemsSolved: supportedStrings("sellerProblemsSolved", 16),
    sellerProofPoints: supportedStrings("sellerProofPoints", 12),
    sellerPortfolioExamples: supportedStrings("sellerPortfolioExamples", 12),
    sellerValuePropositions: supportedStrings("sellerValuePropositions", 16),
    sellerTypicalCustomers: supportedStrings("sellerTypicalCustomers", 16),
    sellerCTAs: supportedStrings("sellerCTAs", 12),
  };
}

/**
 * Parses only source URLs returned by a completed Responses web_search call.
 * A model cannot create a source, date, or offering without a corresponding
 * tool result, and ambiguous company identity is an explicit failure.
 */
export function parseSellerResearchResponse(
  payload: any,
  input: Pick<SellerResearchInput, "companyName" | "vertical" | "website">,
  checkedAt = new Date().toISOString(),
): SellerIntelligenceProfile {
  const result = outputJson(payload);
  const sources = completedWebSearchSources(payload, input.companyName);
  if (!sources.length) {
    throw new Error("Company research returned no completed web-search sources.");
  }
  if (!result || typeof result !== "object") {
    throw new Error("Company research returned an invalid profile.");
  }
  const identityStatus = result.identityStatus
    || ((result as any).identityConfirmed === true ? "confirmed" : "ambiguous");
  if (identityStatus !== "confirmed") {
    throw new Error("Company research could not disambiguate this company name from other companies or rebrands.");
  }
  const aliases = Array.isArray(result.identityAliases)
    ? result.identityAliases.filter((alias): alias is string => typeof alias === "string")
    : [];
  const sourceByUrl = new Map(sources.map(source => [normalizedSourceUrl(source.url), source]));
  const officialUrls = listedUrls(result.officialSourceUrls);
  const identityUrls = listedUrls(result.identitySourceUrls);
  const identitySources = [...new Set([...officialUrls, ...identityUrls])]
    .map(url => sourceByUrl.get(normalizedSourceUrl(url)))
    .filter((source): source is ResearchSourceWithIdentity => Boolean(source));
  const identityNames = [input.companyName, result.resolvedCompanyName || "", ...aliases];
  const identitySourcesWithMatch = identitySources.map(source => ({
    ...source,
    likelyOfficial: likelyOfficialSource(source, identityNames),
  }));
  const officialSources = officialUrls
    .map(url => sourceByUrl.get(normalizedSourceUrl(url)))
    .filter((source): source is ResearchSourceWithIdentity => Boolean(source));
  const identitySourceMap = result.identitySourceMap && typeof result.identitySourceMap === "object"
    ? result.identitySourceMap
    : undefined;
  const mappedIdentityUrls = identitySourceMap
    ? Object.values(identitySourceMap).flatMap(value => listedUrls(value))
    : [];
  const hasExplicitIdentityMapping = identitySourceMap
    ? mappedIdentityUrls.some(url => sourceByUrl.has(normalizedSourceUrl(url)))
    : identityUrls.length > 0;
  if (
    !identitySourcesWithMatch.length
    || !identitySourcesWithMatch.some(source => source.likelyOfficial)
    || !officialSources.some(source => likelyOfficialSource(source, identityNames))
    || !hasExplicitIdentityMapping
  ) {
    throw new Error("Company research could not verify an official source for this company name.");
  }

  const generated = factsFromResult(result, sourceByUrl);
  // The account's Settings name is canonical. A model may identify a former
  // name or brand alias, but it cannot silently rename the tenant.
  generated.sellerCompanyName = input.companyName.trim();
  const usable = Boolean(
    generated.sellerServices.length
    || generated.sellerProducts.length
    || generated.sellerCapabilities.length
    || generated.sellerValuePropositions.length,
  );
  const hasReviewDepth = Boolean(
    generated.sellerDifferentiators.length
    && (generated.sellerBusinessOutcomes.length || generated.sellerProblemsSolved.length),
  );
  const researchStatus: SellerIntelligenceProfile["researchStatus"] = usable ? "ready" : "limited";
  const sourcePages = sources.slice(0, 4).map(source => source.url);
  const profile = {
    status: usable ? (hasReviewDepth ? "ready" : "needs_review") : "limited",
    ...generated,
    sellerCompanyName: input.companyName.trim(),
    sellerWebsite: input.website || null,
    sellerIndustry: input.vertical,
    sourcePages,
    websiteLastAnalyzed: checkedAt,
    websiteAnalysisStatus: usable ? "ready" : "limited",
    lastAnalysisAttemptStatus: usable ? "ready" : "limited",
    lastAnalysisAttemptAt: checkedAt,
    researchVersion: SELLER_RESEARCH_VERSION,
    researchIdentity: {
      ...sellerResearchIdentity(input.companyName, input.vertical),
      ...(aliases.length ? { aliases: aliases.slice(0, 8).map(alias => alias.trim()).filter(Boolean) } : {}),
    },
    researchStatus,
    researchLastAnalyzed: checkedAt,
    researchedGenerated: checkedAt,
    researchMethod: "responses_web_search",
    researchSources: sources.map(({ likelyOfficial: _likelyOfficial, ...source }) => source),
    researchGenerated: generated,
    ...(usable ? {} : { analysisError: "The company name search did not contain enough explicit, source-backed offerings." }),
  };
  return SellerIntelligenceProfileSchema.parse(profile);
}

async function requestSellerResearch(input: SellerResearchInput): Promise<SellerIntelligenceProfile> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("Company research is unavailable because the configured web-research service is not available.");
  }
  let payload: any;
  try {
    const response = await fetch(`${baseURL}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
        include: ["web_search_call.action.sources"],
        max_output_tokens: 5000,
         input: `Research the seller company named "${input.companyName}" for a sales workspace. The seller's Your Industry vertical is "${input.vertical}". This is the seller vertical, not a prospect industry. Today is ${new Date().toISOString().slice(0, 10)}.

Use company-name web search and credible underlying sources to identify the correct company, including current names, former names, brands, acquisitions, and rebrands. Prioritize recent official announcements, newsroom/blog posts, press releases, and current official profiles when determining the current identity and offerings; do not let stale third-party articles override a newer official rebrand or acquisition announcement. Disambiguate same-name companies using the seller vertical and any identifying context available in search results. Do not use, fetch, crawl, or depend on any seller website. Search results must include at least one source that is clearly the company's official source or official profile.

Return only explicit, source-backed facts about this seller's offerings and positioning. Do not invent or infer services, products, capabilities, certifications, customers, proof, outcomes, pricing, guarantees, locations, awards, or industries served. If a field is not explicit in a source, return an empty array. The vertical is a lens for organizing relevant seller facts, not permission to assume IT, janitorial, fleet, or any other capability. Keep facts about this company separate from prospect-industry patterns.

Return JSON:
{
  "identityStatus": "confirmed|ambiguous|not_found",
  "resolvedCompanyName": "current or clearly identified company name",
  "identityAliases": ["former names or brands only when a source explicitly connects them"],
  "identityExplanation": "brief disambiguation explanation",
  "officialSourceUrls": ["URLs from completed web search that are official company sources"],
  "identitySourceUrls": ["URLs from completed web search supporting the identity"],
  "identitySourceMap": {"exact company name or alias": ["URL from completed web search that establishes that identity"]},
  "sellerServices": [], "sellerProducts": [], "sellerCapabilities": [],
  "sellerDifferentiators": [], "sellerCertifications": [],
  "sellerIndustriesServed": [], "sellerBusinessOutcomes": [],
  "sellerProblemsSolved": [], "sellerProofPoints": [],
  "sellerPortfolioExamples": [], "sellerValuePropositions": [],
  "sellerTypicalCustomers": [], "sellerCTAs": [],
  "factEvidence": {
    "sellerServices": {"exact service value": ["URL from completed web search supporting that exact value"]},
    "sellerCapabilities": {"exact capability value": ["URL from completed web search supporting that exact value"]}
  }
}

Every non-empty fact must have a matching entry in factEvidence and be directly supported by at least one source URL from the completed web-search call. Values without matching evidence are discarded server-side. Source URLs and dates are validated server-side and must not be invented.`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Company research returned HTTP ${response.status}.`);
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Company research returned HTTP")) throw error;
    throw new Error("Company-name web research could not be completed.");
  }
  return parseSellerResearchResponse(payload, input);
}

export async function researchSellerCompany(
  input: SellerResearchInput,
  options: { force?: boolean; clientId?: string } = {},
): Promise<SellerIntelligenceProfile> {
  // A caller without a tenant is still allowed for pure unit-level use, but
  // persisted/application research always supplies clientId so one tenant's
  // profile can never satisfy another tenant's cache lookup.
  const key = sellerResearchCacheKey(options.clientId || "uncached", input.companyName, input.vertical);
  if (!options.force) {
    const cached = sellerResearchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.profile);
    sellerResearchCache.delete(key);
  }
  const profile = await requestSellerResearch(input);
  sellerResearchCache.set(key, {
    expiresAt: Date.now() + SELLER_RESEARCH_TTL_MS,
    profile: structuredClone(profile),
  });
  return profile;
}

/**
 * Ensures a tenant's current company-name/vertical profile exists before
 * opportunity research or persistence. The process-local in-flight map keeps a
 * 20-lead search from making 20 identical seller calls.
 */
export async function ensureCurrentSellerResearch(
  clientId: string,
  user: typeof usersTable.$inferSelect,
  options: { force?: boolean } = {},
): Promise<typeof usersTable.$inferSelect> {
  const companyName = user.businessName?.trim() || user.sellerIntelligenceProfile?.researchIdentity?.companyName?.trim()
    || user.sellerIntelligenceProfile?.sellerCompanyName?.trim();
  const vertical = user.vertical?.trim() || "janitorial";

  const key = sellerResearchCacheKey(clientId, companyName || "", vertical);
  const existing = sellerResearchInFlight.get(key);
  if (existing) {
    await existing;
    const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, clientId));
    return fresh || user;
  }
  const operation = (async () => db.transaction(async (tx) => {
    // Hold the same per-account advisory lock used by Settings writes for the
    // complete read -> web research -> write operation. A second request can
    // wait, but it can never attach an old company's result to new settings.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`seller-settings:${clientId}`}))`);
    const [fresh] = await tx.select().from(usersTable).where(eq(usersTable.id, clientId));
    if (!fresh) throw new Error("User settings could not be found.");
    const currentProfile = fresh.sellerIntelligenceProfile;
    const currentCompany = fresh.businessName?.trim() || companyName;
    const currentVertical = fresh.vertical?.trim() || vertical;
    if (!currentCompany) return fresh;
    if (!options.force && (
      sellerResearchIsCurrent(currentProfile, currentCompany, currentVertical)
      || sellerResearchFailureIsRecent(currentProfile, currentCompany, currentVertical)
    )) return fresh.sellerIntelligenceProfile ? fresh : fresh;

    try {
      const researched = await researchSellerCompany({
        companyName: currentCompany,
        vertical: currentVertical,
        website: fresh.website,
      }, { ...options, clientId });
      const sameCompany = sellerResearchSameCompany(currentProfile, currentCompany)
        || researchedIdentityMatchesPrior(researched, currentProfile);
      const profile = applySellerIntelligenceSources(researched, {
        differentiatorsInput: fresh.sellerDifferentiatorsInput,
        servicePriorities: fresh.sellerServicePriorities,
        ...(sameCompany && currentProfile?.userOverrides ? {
          userOverrides: currentProfile.userOverrides,
          userEditedAt: currentProfile.userEditedAt,
        } : {}),
      });
      const [updated] = await tx.update(usersTable)
        .set({
          sellerIntelligenceProfile: SellerIntelligenceProfileSchema.parse({
            ...profile,
            researchIdentity: {
              ...(profile.researchIdentity ?? {}),
              ...sellerResearchIdentity(currentCompany, currentVertical),
            },
          }),
        })
        .where(eq(usersTable.id, clientId))
        .returning();
      return updated || fresh;
    } catch (error) {
      const sameCompany = sellerResearchSameCompany(currentProfile, currentCompany);
      const attemptedAt = new Date().toISOString();
      const profile = sameCompany && currentProfile
        ? SellerIntelligenceProfileSchema.parse({
            ...currentProfile,
            sellerIndustry: currentVertical,
            researchVersion: SELLER_RESEARCH_VERSION,
            researchIdentity: {
              ...(currentProfile.researchIdentity ?? {}),
              ...sellerResearchIdentity(currentCompany, currentVertical),
            },
            researchStatus: "failed",
            researchMethod: "responses_web_search",
            lastAnalysisAttemptStatus: "failed",
            lastAnalysisAttemptAt: attemptedAt,
            analysisError: error instanceof Error ? error.message.slice(0, 200) : "Company research failed.",
          })
        : SellerIntelligenceProfileSchema.parse({
            ...buildGenericSellerProfile(
              fresh.website,
              currentVertical,
              error instanceof Error ? error.message : "Company-name web research failed.",
              currentCompany,
            ),
            researchIdentity: sellerResearchIdentity(currentCompany, currentVertical),
          });
      const [updated] = await tx.update(usersTable)
        .set({ sellerIntelligenceProfile: profile })
        .where(eq(usersTable.id, clientId))
        .returning();
      // A failed refresh is explicit in profile metadata, but should not make
      // settings/opportunity requests lose a previously approved same-company
      // profile. New companies receive the limited generic profile above.
      return updated || fresh;
    }
  }))();
  sellerResearchInFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    sellerResearchInFlight.delete(key);
  }
}
