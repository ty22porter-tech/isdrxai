import { Router, type Request, type Response as ExpressResponse } from "express";
import { SearchPaused, type ProspectSearchExecution } from "../lib/prospectSearchExecution";
import { RECRUITING_INDUSTRIES, recruitingAutomationBlocked, parseRecruitingResearch } from "../lib/recruitingResearch";
import { discoverHiringEmployers, RecruitingJobSearchError, eligibleHiringResearch, jobInSearchArea, matchesHiringJob, sameJobLocation } from "../lib/recruitingJobDiscovery";
import { activeRecruitingFilterLabels, distanceMiles, filterRecruitingOpportunity, requiresRecruitingResearch } from "../lib/recruitingFilters";
import { prospectScope } from "../lib/verticalScope";
import { db } from "@workspace/db";
import { prospectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GenerateEmailBody,
  GenerateCallScriptBody,
  ProspectSearchBody,
  EnrichLeadsBody,
  RefreshOpportunityIntelligenceBody,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";
import { enrichPerson, isPlaceholderEmail } from "../lib/apollo";
import { logger } from "../lib/logger";
import {
  genericOutreach,
  industryMatch,
  potentialNeedsForSeller,
  sellerIntelligenceProfile,
} from "../lib/prospectMatching";
import { EmailGenerationError, generateProspectEmailDraft } from "../lib/emailGeneration";
import { buildOpportunityIntelligence } from "../lib/opportunityIntelligence";
import { researchPublicBreachRecords } from "../lib/publicBreachResearch";
import { researchCompanyDemographics } from "../lib/companyDemographicResearch";
import {
  cacheTrustedItResearch,
  attachResearchProof,
  verifyResearchHandoff,
  ItOpportunityResearchError,
  ItOpportunityResearchTimeoutError,
  researchItOpportunityIntelligence,
  withResearchPipelineTimeout,
} from "../lib/itOpportunityResearch";
import { ensureCurrentSellerResearch } from "../lib/sellerResearch";

const router = Router();
router.use(requireAuth, requireEntitlement);

function generateCallScript(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, objective: string = "set appointment") {
  const { companyName, contactName, industry, city, squareFootage } = prospect;
  const firstName = contactName.split(" ")[0];
  const senderName = client?.senderName?.trim() || client?.businessName?.trim() || "our team";
  const businessName = client?.businessName?.trim() || "our company";
  const vertical = getVerticalConfig(client?.vertical).key;
  const match = industryMatch(industry, vertical);

  if (vertical === "it_services") {
    const recommendation = prospect.opportunityIntelligence?.itResearch?.recommendations[0];
    const researchedIndustry = prospect.opportunityIntelligence?.itResearch?.actualIndustry || industry;
    const researchQuestion = recommendation?.discoveryQuestion
      || `How is ${match.challenges[0]} being handled today, and where would additional support be most useful?`;
    const approvedOffer = recommendation?.offering;
    const seller = sellerIntelligenceProfile(client);
    const offerSentence = approvedOffer && seller.ready
      ? `When it is relevant, we help with ${approvedOffer}.`
      : "I’m calling to understand your current approach rather than assume a solution.";
    const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out regarding ${researchedIndustry} operations in ${city} — I'll keep this brief. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"I'm calling with one research-led question about ${companyName}: ${researchQuestion}

${offerSentence} I don't want to assume there is a current problem, provider change, or purchase plan — I wanted to learn whether this is a priority for your team."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a brief discovery call this week — say Tuesday or Thursday afternoon?` : `Can I send a short overview after we understand whether that is relevant?`}"`;

    const keyPoints = [
      `Use the researched industry context (${researchedIndustry}) without claiming prior experience unless it is configured`,
      recommendation ? `Use the research-led discovery question about ${recommendation.prospectConcern}` : "Use a discovery question; no company-specific IT concern is assumed",
      approvedOffer ? `Name only the matched approved offering: ${approvedOffer}` : "Do not name an unverified seller offering",
      "Keep the ask small: a brief discovery call, not a commitment",
      `Always confirm a specific day/time, not an open-ended "sometime this week"`,
    ];

    const objectionHandlers = [
      {
        objection: "We already have an IT provider",
        response: `"That makes sense. I'm not assuming you need to change providers; would it be useful to compare how the cited concern is being handled today?"`,
      },
      {
        objection: "We're not interested / not looking right now",
        response: `"I completely understand, ${firstName}. Timing is everything. Would it be okay if I followed up in a couple months? And if anything changes — or if a security incident ever comes up — I'll make sure you have my direct number."`,
      },
      {
        objection: "Send me information by email",
        response: `"Absolutely, I'll send that right over. What's the best email for you? And just so the info is relevant — roughly how many workstations and servers does ${companyName} run? That helps me tailor what I send."`,
      },
      {
        objection: "We're under contract",
        response: `"Understood. I’m not asking you to change anything today. May I send a short overview of ${approvedOffer || "the relevant approach"} for whenever a future review is useful?"`,
      },
      {
        objection: "Too busy right now",
        response: `"Understood. Would a short, scheduled discovery conversation at a more convenient time be useful, or should I send a brief overview instead?"`,
      },
    ];

    return { script, keyPoints, objectionHandlers };
  }

  const researchIndustry = prospect.opportunityIntelligence?.itResearch?.actualIndustry || industry;
  const recommendation = prospect.opportunityIntelligence?.itResearch?.recommendations[0];
  const seller = sellerIntelligenceProfile(client);
  const approvedOffer = recommendation?.offering;
  const offerSentence = approvedOffer && seller.ready
    ? `When it is relevant, we help with ${approvedOffer}.`
    : "I’m calling to understand your current approach rather than assume a solution.";
  const researchQuestion = recommendation?.discoveryQuestion
    || `How is ${match.challenges[0]} being handled today, and where would additional support be most useful?`;
  const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out regarding ${researchIndustry} operations in ${city} — I'll keep this brief. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"I'm calling with one research-led question about ${companyName}: ${researchQuestion}

${offerSentence} I don't want to assume there is a current problem, provider change, or purchase plan — I wanted to learn whether this is a priority for your team."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a brief discovery call this week — say Tuesday or Thursday afternoon?` : `Can I send a short overview after we understand whether that is relevant?`}"`;

  const keyPoints = [
    `Use the researched industry context (${researchIndustry}) without claiming prior experience unless it is configured`,
    recommendation ? `Use the research-led discovery question about ${recommendation.prospectConcern}` : "Use a discovery question; no company-specific concern is assumed",
    approvedOffer ? `Name only the matched approved offering: ${approvedOffer}` : "Do not name an unverified seller offering",
    "Keep the ask small: a brief discovery call, not a commitment",
    `Always confirm a specific day/time, not an open-ended "sometime this week"`,
  ];

  const objectionHandlers = [
    {
      objection: "We're not interested / not looking right now",
      response: `"I completely understand, ${firstName}. Timing is everything. Would it be okay if I followed up in a couple months? And if anything changes, I'll make sure you have my direct number."`,
    },
    {
      objection: "Send me information by email",
      response: `"Absolutely, I'll send that right over. What's the best email for you? I want to make sure the information is relevant to your current operation."`,
    },
    {
      objection: "We're under contract",
      response: `"Understood. I’m not asking you to change anything today. May I send a short overview of ${approvedOffer || "the relevant approach"} for whenever a future review is useful?"`,
    },
    {
      objection: "Too busy right now",
      response: `"Understood. Would a short, scheduled discovery conversation at a more convenient time be useful, or should I send a brief overview instead?"`,
    },
  ];

  return { script, keyPoints, objectionHandlers };
}

router.post("/generate-email", requireEntitlement, async (req, res) => {
  try {
    const body = GenerateEmailBody.parse(req.body);
    const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), prospectScope(req.clientId, req.dbUser?.vertical)));
    if (!prospect) return res.status(404).json({ error: "Prospect not found" });
    let [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
    client = client ? await ensureCurrentSellerResearch(req.clientId, client) : client;
    const result = await generateProspectEmailDraft(prospect, client, body.tone);
    return res.json({ subject: result.subject, body: result.body });
  } catch (err) {
    if (err instanceof EmailGenerationError) {
      return res.status(err.status).json({ error: err.message });
    }
    req.log?.error?.({ err }, "AI generate-email failed");
    return res.status(500).json({ error: "Failed to generate an evidence-safe AI email draft. Please try again." });
  }
});

router.post("/generate-call-script", requireEntitlement, async (req, res) => {
  const body = GenerateCallScriptBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), prospectScope(req.clientId, req.dbUser?.vertical)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  if (recruitingAutomationBlocked(prospect)) return res.status(409).json({ error: "Recruiting pitch generation is suppressed pending employer and agency-policy review." });
  let [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  client = client ? await ensureCurrentSellerResearch(req.clientId, client) : client;
  const result = generateCallScript(prospect, client, body.objective);
  return res.json(result);
});

type BaseLead = ReturnType<typeof placeToLeadBase>;

function addFleetOverlay(lead: BaseLead, industry: string, client?: typeof usersTable.$inferSelect) {
  const seller = sellerIntelligenceProfile(client);
  const match = industryMatch(industry, "fleet_wraps");
  const verifiedSignals = [
    lead.address ? `Google Places lists an operating address in ${lead.city}, ${lead.state}` : null,
    lead.website ? `Google Places lists the public website ${lead.website}` : null,
    lead.phone ? "Google Places lists a published business phone number" : null,
  ].filter(Boolean);
  const verificationScore = (lead.address ? 10 : 0) + (lead.website ? 8 : 0) + (lead.phone ? 6 : 0);
  const opportunityScore = Math.min(100, 28 + (seller.ready ? 24 : 10) + verificationScore);
  const scoreLabel = opportunityScore >= 80 ? "High Priority" : opportunityScore >= 60 ? "Strong Fit" : opportunityScore >= 30 ? "Possible Fit" : "Low Priority";
  const verified = verifiedSignals.length ? verifiedSignals.join("; ") : "No direct operating, website, or phone signal was available in the Google Places result.";
  const fleetBrandingSignal = `Verified: ${verified}. Industry Fit: ${match.operation} Unverified: Actual vehicle ownership, fleet size, vehicle purchases, hiring, expansion, rebranding, location count, and current wrap status have not been confirmed.`;
  const whyTarget = `${lead.companyName} is a verified ${lead.industry} business in ${lead.city}, ${lead.state}. ${match.operation} ${seller.ready ? `${seller.name}'s ${seller.capabilities.concat(seller.services).slice(0, 2).join(" and ")} may be relevant if discovery confirms a need.` : "Seller capabilities have not been configured, so begin with discovery rather than a product claim."}`;

  return {
    ...lead,
    vertical: "fleet_wraps" as const,
    opportunityScore,
    scoreLabel,
    scoreExplanation: `Fleet opportunity score is based only on the selected industry's potential fit, the configured seller profile when available, and verified Google Places signals. Fleet size, vehicle purchases, hiring, expansion, rebranding, and current vehicle-wrap status are not assumed.`,
    whyTarget,
    potentialNeeds: potentialNeedsForSeller(client, industry, "fleet_wraps"),
    fleetBrandingSignal,
    recommendedOutreach: genericOutreach(client, industry, "fleet_wraps"),
  };
}

// ─── Real business search via Google Places (Text Search) ────────────────────
// Replaces the old mock/practice-data generators: results are real companies
// found by city + industry. Contact name/email are placeholders until
// enrichment fills them in.

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

interface PlaceResult {
  location?: { latitude: number; longitude: number };
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
}

function websiteDomain(uri?: string): string | undefined {
  if (!uri) return undefined;
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const PLACES_PAGE_SIZE = 20;
const PLACES_MAX_PAGES = 10;
const PLACES_FETCH_TIMEOUT_MS = 10_000;

function placeIdentity(place: PlaceResult): string {
  if (place.id?.trim()) return `id:${place.id.trim()}`;
  const normalize = (value?: string) => (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return `fallback:${normalize(place.displayName?.text)}|${normalize(place.formattedAddress)}`;
}

async function searchRealBusinesses(apiKey: string, city: string, state: string, industry: string, count: number, geography?: { center: { latitude: number; longitude: number }; radiusMiles: number }): Promise<PlaceResult[]> {
  const industryLabel = industry && industry !== "All Industries" ? `${industry} ` : "";
  const textQuery = `${industryLabel}businesses in ${city}, ${state}`;
  const desiredCount = Math.max(0, Math.min(Math.trunc(count), 100));
  if (desiredCount === 0) return [];
  const results: PlaceResult[] = [];
  const identities = new Set<string>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 1; page <= PLACES_MAX_PAGES && results.length < desiredCount; page += 1) {
    let resp: Response;
    try {
      resp = await fetch(PLACES_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.location,nextPageToken",
        },
        body: JSON.stringify({
          textQuery,
          pageSize: Math.min(desiredCount, PLACES_PAGE_SIZE),
          ...(geography ? { locationBias: { circle: { center: geography.center, radius: Math.min(50_000, geography.radiusMiles * 1609.344) } } } : {}),
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(PLACES_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      throw new ProspectSearchError(
        timedOut ? 504 : 502,
        timedOut
          ? `Google Places search timed out while fetching page ${page}. No partial results were returned.`
          : `Could not reach Google Places while fetching page ${page}. No partial results were returned.`,
      );
    }

    if (!resp.ok) {
      let detail = "";
      try {
        const errBody = await resp.json() as { error?: { message?: string; status?: string } };
        detail = errBody?.error?.message ?? "";
      } catch { /* non-JSON error body */ }

      if (resp.status === 400 && /API key not valid/i.test(detail)) {
        throw new ProspectSearchError(401, "Your Google Maps API key isn't valid. Double-check that the key in your GOOGLE_MAPS_API_KEY secret was copied completely, with no extra spaces.");
      }
      if (resp.status === 403) {
        throw new ProspectSearchError(403, `Google rejected the request (permission denied). Make sure the "Places API (New)" is enabled for your key in Google Cloud Console.${detail ? ` Details: ${detail}` : ""}`);
      }
      if (resp.status === 429) {
        throw new ProspectSearchError(429, "Google Places quota exceeded — wait a minute and try again, or check your quota in Google Cloud Console.");
      }
      throw new ProspectSearchError(502, `Google Places search failed on page ${page} (HTTP ${resp.status}); no partial results were returned.${detail ? ` Details: ${detail}` : ""}`);
    }

    let data: { places?: PlaceResult[]; nextPageToken?: string };
    try {
      data = await resp.json() as { places?: PlaceResult[]; nextPageToken?: string };
    } catch {
      throw new ProspectSearchError(502, `Google Places returned an invalid response on page ${page}; no partial results were returned.`);
    }

    for (const place of data.places ?? []) {
      if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
      if (geography && (!place.location || distanceMiles(geography.center, place.location) > geography.radiusMiles)) continue;
      const identity = placeIdentity(place);
      if (identities.has(identity)) continue;
      identities.add(identity);
      results.push(place);
      if (results.length >= desiredCount) break;
    }

    const nextPageToken = data.nextPageToken?.trim();
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) break;
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  return results;
}

class ProspectSearchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function placeToLeadBase(place: PlaceResult, city: string, state: string, industry: string, vertical: string) {
  const companyName = place.displayName?.text?.trim() || "Unknown business";
  const domain = websiteDomain(place.websiteUri);
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "business";
  // Placeholder contact + email until enrichment fills in a real decision-maker.
  // Without a website we use the reserved .invalid TLD so nothing can be
  // silently delivered to a made-up address.
  // Always use a non-deliverable .invalid placeholder — even when a website
  // domain is available, "info@<domain>" is a guessed address that could
  // dispatch real outreach to the wrong recipient. Enrichment (Task #104)
  // is the correct path to a confirmed contact email.
  const email = `contact@${slug}.invalid`;
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || "";
  const confidence: "high" | "medium" | "low" = phone && domain ? "high" : phone || domain ? "medium" : "low";
  const industryLabel = industry && industry !== "All Industries" ? industry : "Local business";

  // Fit rationale: why this company is worth pursuing, built from the real
  // signals the search verified (not just proof the business exists).
  const fitSignals: string[] = [];
  if (place.formattedAddress) fitSignals.push("operates a physical facility (an ongoing need for on-site commercial services)");
  if (domain) fitSignals.push("has an active website, so it's an established operation rather than a side gig");
  if (phone) fitSignals.push("publishes a direct phone line for follow-up calls");
  const fitText = fitSignals.length
    ? ` It ${fitSignals.join(", and ")}.`
    : "";
  const whyTarget = vertical === "ai_sales_automation"
    ? `${companyName} was found in the ${industryLabel} business search. Research whether it sells to businesses and could benefit from autonomous prospecting, personalized outreach and follow-up; its sales workflow, current spending and purchase intent are unverified.`
    : `${industryLabel} companies in ${city}, ${state} are a strong fit for recurring commercial service contracts — they have facilities to maintain and typically rely on outside vendors for upkeep.${fitText}`;

  return {
    companyName,
    contactName: "Owner",
    contactTitle: "Decision maker (pending enrichment)",
    email,
    phone,
    industry: industryLabel,
    city,
    state,
    website: domain,
    address: place.formattedAddress,
    whyTarget,
    confidence,
    vertical,
  };
}

// Opportunity narratives are deterministic projections of structured evidence.
// This keeps unsupported LLM prose from turning implications into prospect facts.

export async function performProspectSearch(req: Request, res: ExpressResponse, execution?: ProspectSearchExecution) {
  const parsed = ProspectSearchBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(parsed.data.count)) {
    return res.status(400).json({ error: "Prospect search request is invalid. Count must be a whole number from 1 to 100." });
  }
  const body = parsed.data;
  const count = body.count;
  let [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client) return res.status(404).json({ error: "User settings could not be found." });
  client = await ensureCurrentSellerResearch(req.clientId, client);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey && getVerticalConfig(client?.vertical).key !== "recruiting_staffing") {
    return res.status(503).json({
      error: "Real business search isn't set up yet: the GOOGLE_MAPS_API_KEY secret is missing. Add your Google Maps API key (with the Places API enabled) to search real local businesses.",
    });
  }

  const vertical = getVerticalConfig(client?.vertical).key;
  if (execution && vertical !== "recruiting_staffing") {
    return res.status(409).json({ error: "This saved Recruiting search no longer matches your account industry. Start a new search." });
  }

  try {
    const recruiting = vertical === "recruiting_staffing";
    const industries = recruiting
      ? body.recruitingFilters?.industries?.length ? body.recruitingFilters.industries : [body.industry]
      : [body.industry];
    if (recruiting && industries.some(industry => !(RECRUITING_INDUSTRIES as readonly string[]).includes(industry))) {
      return res.status(400).json({ error: "Select one or more supported employer industries." });
    }
    const hiringEmployers = recruiting ? execution?.discovery ?? await discoverHiringEmployers({
      city: body.city.trim(), state: body.state, count, industries, filters: body.recruitingFilters,
    }) : [];
    if (recruiting && execution && !execution.discovery) await execution.saveDiscovery(hiringEmployers);
    const groupedPlaces = recruiting ? [] : await Promise.all(industries.map(async industry => ({
      industry,
      places: await searchRealBusinesses(apiKey!, body.city.trim(), body.state, industry, Math.ceil(count / industries.length)),
    })));
    const seenEmployers = new Set<string>();
    const bases = recruiting ? hiringEmployers.map(employer => ({
      ...placeToLeadBase({ displayName: { text: employer.companyName }, websiteUri: employer.website },
        body.city.trim(), body.state, employer.industry, vertical),
      whyTarget: "Published job openings found; employer research and service qualification are pending.",
      confidence: "low" as const,
    })) : groupedPlaces.flatMap(group => group.places.map(place => {
      const key = recruiting ? websiteDomain(place.websiteUri) || placeIdentity(place) : placeIdentity(place);
      if (seenEmployers.has(key)) return null;
      seenEmployers.add(key);
      return placeToLeadBase(place, body.city.trim(), body.state, group.industry, vertical);
    })).filter((lead): lead is BaseLead => Boolean(lead)).slice(0, count);

    const processBase = async (base: BaseLead) => {
      const lead: BaseLead & { employeeCount?: number | null } = vertical === "fleet_wraps"
          ? addFleetOverlay(base, body.industry, client)
          : base;
      if (recruiting && body.recruitingFilters?.companySize) {
        // Company research is distinct from Apollo person enrichment and does
        // not spend a contact-enrichment credit.
        const demographics = await researchCompanyDemographics({
          companyName: lead.companyName, website: lead.website, city: lead.city, state: lead.state,
        });
        if (demographics?.employeeCount) lead.employeeCount = demographics.employeeCount;
      }
      let researched;
      try {
        // All supported seller verticals receive the same three-part,
        // evidence-guarded report. The report's prompt and score rubric are
        // vertical-aware; the legacy itResearch field is retained only for
        // backwards-compatible saved payloads.
        researched = await researchItOpportunityIntelligence({
          clientId: req.clientId,
          lead,
          selectedIndustry: lead.industry,
          client,
          force: true,
          ...(recruiting ? { discoveredHiring: hiringEmployers.find(employer => employer.companyName === lead.companyName)?.jobs } : {}),
        });
      } catch (err) {
        req.log.warn({ err, vertical }, "Employer discovered but opportunity research failed");
        const discoveredJobs = hiringEmployers.find(employer => employer.companyName === lead.companyName)?.jobs ?? [];
        const discoveryReport = recruiting && discoveredJobs.length ? {
          selectedIndustry: lead.industry, actualIndustry: null,
          industryRelationship: "uncertain" as const,
          industryExplanation: "Published job listings were found, but employer verification could not be completed.",
          industrySources: [], lastResearched: new Date().toISOString(),
          warnings: ["Preliminary job-discovery evidence only. Employer identity and current hiring remain unverified."],
          industryChallenges: [], prospectConcerns: [], recommendations: [],
          recruiting: parseRecruitingResearch({ employerIdentity: "unverified", jobs: discoveredJobs }, {
            companyName: lead.companyName, allowedSourceUrls: discoveredJobs.map(job => job.sourceURL),
            identityVerified: false,
          }),
        } : undefined;
        return {
          ...lead,
          opportunityScore: 0,
          estimatedEmployees: lead.employeeCount,
          scoreLabel: "Research unavailable",
          scoreExplanation: `${vertical} opportunity research could not be completed for this lead.`,
          whyTarget: "Current opportunity research is unavailable; refresh research before saving or acting on this lead.",
          potentialNeeds: [],
          recommendedOutreach: "",
          researchError: err instanceof Error ? err.message : "Current opportunity research could not be completed.",
          ...(err instanceof ItOpportunityResearchError && err.retryAfterMs
            ? { researchRetryAfterMs: err.retryAfterMs } : {}),
          ...(discoveryReport ? { opportunityIntelligence: buildOpportunityIntelligence(lead, vertical, client, [], discoveryReport) } : {}),
        };
      }
      const publicBreachSignals = recruiting ? [] : await researchPublicBreachRecords({
        ...lead,
        industry: body.industry,
      });
      const signals = [...researched.signals, ...publicBreachSignals];
      cacheTrustedItResearch(req.clientId, lead, lead.industry, client, {
        itResearch: researched.itResearch,
        signals,
      });
      const opportunityIntelligence = attachResearchProof(
        buildOpportunityIntelligence(lead, vertical, client, signals, researched.itResearch),
        req.clientId, lead, client,
      );
      return {
        ...lead,
        opportunityScore: opportunityIntelligence.score,
        estimatedEmployees: lead.employeeCount,
        scoreLabel: opportunityIntelligence.label,
        scoreExplanation: opportunityIntelligence.definition,
        whyTarget: opportunityIntelligence.whyTarget,
        potentialNeeds: opportunityIntelligence.potentialNeeds,
        recommendedOutreach: opportunityIntelligence.recommendedOutreach,
        opportunityIntelligence,
      };
    };
    const leads: any[] = new Array(bases.length);
    const queue = bases.map((_, index) => index);
    // Saved Recruiting searches use one provider request at a time; other
    // verticals retain their existing bounded concurrency.
    await Promise.all(Array.from({ length: Math.min(execution ? 1 : 3, bases.length) }, async () => {
      while (queue.length) {
        const index = queue.shift();
        if (index === undefined) return;
        const cached = execution?.checkpoints[String(index)];
        if (cached && (!cached.researchRetryAfterMs || (execution?.attempts[String(index)] ?? 0) >= 3)) {
          leads[index] = cached;
          continue;
        }
        leads[index] = await processBase(bases[index]);
        if (execution) {
          await execution.saveLead(index, leads[index]);
          if (leads[index].researchRetryAfterMs) {
            throw new SearchPaused(Math.max(leads[index].researchRetryAfterMs,
              30_000 * 2 ** Math.max(0, (execution.attempts[String(index)] ?? 1) - 1)));
          }
        }
      }
    }));

    // Strongest seller-specific opportunities first. This never uses engagement.
    leads.sort((a: any, b: any) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
    const results = recruiting ? leads.filter(lead =>
      lead.opportunityIntelligence
        ? eligibleHiringResearch(lead.opportunityIntelligence.itResearch?.recruiting,
            lead.opportunityIntelligence.itResearch?.industryRelationship === "match"
            && Boolean(lead.opportunityIntelligence.itResearch?.recommendations.length))
          && filterRecruitingOpportunity(lead.opportunityIntelligence, {
            ...body.recruitingFilters, minRelevantJobs: Math.max(1, body.recruitingFilters?.minRelevantJobs ?? 1),
          }, lead)
          && lead.opportunityIntelligence.itResearch?.industryRelationship === "match"
          && lead.opportunityIntelligence.itResearch?.recruiting?.jobs.filter((job: any) =>
            matchesHiringJob(job, body.recruitingFilters) && (body.recruitingFilters?.radiusMiles
              ? hiringEmployers.find(employer => employer.companyName === lead.companyName)?.jobs.some(seed =>
                  sameJobLocation(seed.location, job.location))
              : jobInSearchArea(job, body))).length >= Math.max(1, body.recruitingFilters?.minRelevantJobs ?? 1)
        : false) : leads;
    const researchFailures = leads.filter(lead => Boolean(lead.researchError)).length;
    req.log.info({
      vertical, discovered: bases.length, researchFailures,
      excluded: leads.length - results.length, returned: results.length,
      ...(recruiting ? { activeFilters: activeRecruitingFilterLabels(body.recruitingFilters) } : {}),
    }, "Prospect search completed");
    if (recruiting && !results.length && bases.length) {
      // Keep the existing discovery available for an explicit review action.
      // Do not turn unidentified agency advertisements into hiring employers.
      const discoveredLeads = leads.filter(lead => !lead.opportunityIntelligence
        || filterRecruitingOpportunity(lead.opportunityIntelligence, undefined, lead))
        .map(lead => ({ ...lead, outsideSelectedFilters: true }));
      return res.status(researchFailures === leads.length ? 502 : 422).json({
        error: `Found ${bases.length} employers from published job openings. Employer research was unavailable for ${researchFailures}. No employer passed all hiring, identity, agency-policy and service-fit checks. You can review these employers without treating them as qualified matches.`,
        discoveredCount: bases.length,
        researchFailures,
        excludedAgencyAds: leads.length - discoveredLeads.length,
        activeFilters: activeRecruitingFilterLabels(body.recruitingFilters),
        discoveredLeads,
      });
    }
    // A partial success must not hide sourced jobs whose employer research
    // failed. Keep them explicitly review-only and outside automatic enrichment.
    const pendingReview = recruiting ? leads.filter(lead => !results.includes(lead)
      && lead.opportunityIntelligence?.itResearch?.recruiting?.jobs.some((job: any) => job.status === "unknown")
      && filterRecruitingOpportunity(lead.opportunityIntelligence, undefined, lead))
      .map(lead => ({ ...lead, outsideSelectedFilters: true })) : [];
    return res.json([...results, ...pendingReview]);
  } catch (err) {
    if (err instanceof SearchPaused) throw err;
    if (err instanceof RecruitingJobSearchError) {
      if (execution && err.retryAfterMs) throw new SearchPaused(err.retryAfterMs);
      return res.status(502).json({ error: err.message });
    }
    if (err instanceof ProspectSearchError) {
      return res.status(err.status).json({ error: err.message });
    }
    req.log.error({ err }, "prospect-search failed");
    return res.status(502).json({
      error: err instanceof ItOpportunityResearchError
        ? err.message
        : vertical === "recruiting_staffing"
          ? "Job search or employer research could not complete. Please try again."
          : "Could not reach Google Places. Please try again in a moment.",
    });
  }
}
router.post("/prospect-search", requireEntitlement, (req, res) => performProspectSearch(req, res));

// ─── Lead enrichment (pre-pipeline) ──────────────────────────────────────────
// Runs Apollo people search against unsaved search-results leads so the real
// decision-maker name and email appear on the results page before the user
// adds anything to the pipeline. Returns a per-lead status so the UI can show
// a clear "not found" indicator instead of silently keeping placeholders.

type EnrichLeadResult = {
  index: number;
  status: "enriched" | "not_found" | "failed";
  contactName?: string;
  email?: string;
  title?: string;
  phone?: string;
  linkedinUrl?: string;
  employeeCount?: number;
  opportunityIntelligence?: ReturnType<typeof buildOpportunityIntelligence>;
  error?: string;
  researchWarning?: string;
  contactMatch?: import("../lib/recruitingContactTargeting").RecruitingContactMatch;
};

function enrichmentErrorCategory(err: unknown): string {
  if (err instanceof ItOpportunityResearchTimeoutError) return "research_timeout";
  if (err instanceof ItOpportunityResearchError) return "research_provider";
  if (err instanceof Error && /rate limit|429/i.test(err.message)) return "rate_limit";
  if (err instanceof Error && /not configured/i.test(err.message)) return "configuration";
  if (err instanceof Error && /timeout|timed out/i.test(err.message)) return "timeout";
  return "unexpected";
}

router.post("/enrich-leads", requireEntitlement, async (req, res) => {
  const parsed = EnrichLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Contact enrichment request is invalid. Provide 1 to 100 leads with a company name and email." });
  }
  const { leads } = parsed.data;

  let [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client) return res.status(404).json({ error: "User settings could not be found." });
  client = await ensureCurrentSellerResearch(req.clientId, client);
  const vertical = getVerticalConfig(client?.vertical).key;

  const results: EnrichLeadResult[] = [];
  let planBlocked = false;
  let runError: string | undefined;

  const processOne = async (index: number) => {
    let phase = "apollo";
    try {
      if (planBlocked) {
        logger.warn({ phase, index, category: "api_inaccessible" }, "Lead contact enrichment skipped");
        results.push({ index, status: "failed", error: runError });
        return;
      }
      const lead = leads[index];
      const priorResearch = verifyResearchHandoff(
        lead.opportunityIntelligence?.researchProof,
        req.clientId,
        {
          companyName: lead.companyName,
          website: lead.website,
          industry: lead.industry,
          city: lead.city,
          state: lead.state,
          employeeCount: lead.employeeCount,
        },
        client,
      );
      if (vertical === "recruiting_staffing" && !priorResearch.ok) {
        const reason = priorResearch.reason;
        logger.warn({ phase: "research_handoff", index, reason }, "Recruiting contact lookup blocked by saved research handoff");
        const detail = reason === "missing" ? "the saved research proof is missing"
          : reason === "expired" ? "the saved research proof has expired"
          : reason === "identity_changed" ? "the employer details changed after research"
          : reason === "seller_changed" ? "your seller profile changed after research"
          : "the saved research proof could not be verified";
        results.push({ index, status: "failed", error: `Contact lookup skipped: ${detail}. Refresh research before retrying.` });
        return;
      }
      if (vertical === "recruiting_staffing" && priorResearch.ok
        && !eligibleHiringResearch(priorResearch.handoff.itResearch.recruiting,
          priorResearch.handoff.itResearch.industryRelationship === "match"
          && Boolean(priorResearch.handoff.itResearch.recommendations.length))) {
        results.push({ index, status: "failed", error: "Contact lookup skipped: verified active hiring, confirmed employer identity, service fit and agency-policy clearance are required. Refresh research before retrying." });
        return;
      }
      const result = await enrichPerson({
        email: lead.email,
        contactName: lead.contactName ?? null,
        companyName: lead.companyName,
        website: lead.website ?? null,
        vertical,
        ...(vertical === "recruiting_staffing" && priorResearch.ok
          ? { recruitingJobs: priorResearch.handoff.itResearch.recruiting?.jobs } : {}),
      });
      if (!result.ok) {
        if (result.planBlocked) {
          planBlocked = true;
          runError = result.error;
        }
        logger.warn({ phase, index, category: result.planBlocked ? "api_inaccessible" : enrichmentErrorCategory(new Error(result.error)) }, "Lead contact enrichment failed");
        results.push({ index, status: "failed", error: result.error });
        return;
      }
      const p = result.person;
      // A name alone cannot turn a search-result placeholder into a reachable contact.
      // Retain a previously usable address if Apollo found a person but returned no email.
      const usableEmail = (value: string | null | undefined) => {
        const email = value?.trim();
        return email && !isPlaceholderEmail(email) && !email.split("@")[0].includes("..")
          && /^[^\s@]+@[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?)+$/i.test(email)
          ? email.toLowerCase() : undefined;
      };
      const contactEmail = usableEmail(p?.email) ?? (p ? usableEmail(lead.email) : undefined);
      const contactFound = Boolean(p && contactEmail);
      let demographicResearch: Awaited<ReturnType<typeof researchCompanyDemographics>> | undefined;
      const warnings: string[] = [];
      if (!p?.employeeCount) {
        phase = "demographics";
        try {
          demographicResearch = await researchCompanyDemographics({
            companyName: lead.companyName,
            website: lead.website,
            city: lead.city,
            state: lead.state,
            industry: lead.industry,
          });
        } catch (err) {
          logger.warn({ phase, index, category: enrichmentErrorCategory(err) }, "Optional lead research failed");
          warnings.push("Company size research was unavailable; contact enrichment was retained.");
        }
      }
      const employeeCount = p?.employeeCount ?? demographicResearch?.employeeCount;
      let opportunityIntelligence: ReturnType<typeof buildOpportunityIntelligence> | undefined;
      if (lead.industry && lead.city && lead.state) {
        const intelligenceLead = {
          companyName: lead.companyName,
          contactTitle: p?.title ?? null,
          employeeCount,
          employeeCountSource: demographicResearch ? "AI-assisted public web research" : "Apollo company enrichment",
          employeeCountSourceURL: demographicResearch?.sourceUrls[0],
          employeeCountEvidence: demographicResearch?.explanation,
          industry: lead.industry,
          city: lead.city,
          state: lead.state,
          address: lead.address ?? null,
          website: lead.website ?? null,
          phone: p?.phone ?? lead.phone ?? null,
        };
        const apolloCompanySignal = p?.organizationDescription && p.website
          ? [{
              signalType: "company_operating_profile",
              signalTitle: "Company operating profile",
              signalDescription: p.organizationDescription,
              signalClassification: "verified" as const,
              confidenceLevel: "medium" as const,
              freshness: "unknown" as const,
              sourceName: "Apollo company enrichment",
              sourceURL: p.website,
              dateDiscovered: new Date().toISOString(),
              dateVerified: new Date().toISOString(),
              supportingEvidence: p.organizationDescription,
              points: 0,
            }]
          : [];
        phase = "opportunity_research";
        try {
          // Keep the verified openings used to choose a recruiting contact.
          // Apollo demographics can change the cache key; a second web search
          // could then replace those openings with unrelated roles.
          const [researched, publicBreachSignals] = vertical === "recruiting_staffing" && priorResearch.ok
            ? [{ itResearch: priorResearch.handoff.itResearch, signals: priorResearch.handoff.signals }, []]
            : await Promise.all([
            // Search intelligence is held in a server-only tenant cache, so a
            // client cannot forge its report while enriching an unsaved result.
            researchItOpportunityIntelligence({
              clientId: req.clientId,
              lead: intelligenceLead,
              selectedIndustry: lead.industry,
              client,
            }),
            researchPublicBreachRecords(intelligenceLead),
          ]);
          const signals = [...researched.signals, ...publicBreachSignals, ...apolloCompanySignal];
          cacheTrustedItResearch(req.clientId, intelligenceLead, lead.industry, client, {
            itResearch: researched.itResearch,
            signals,
          });
          opportunityIntelligence = attachResearchProof(
            buildOpportunityIntelligence(intelligenceLead, vertical, client, signals, researched.itResearch),
            req.clientId, intelligenceLead, client,
          );
        } catch (err) {
          logger.warn({ phase, index, category: enrichmentErrorCategory(err) }, "Optional lead research failed");
          warnings.push("Opportunity research was unavailable; existing opportunity intelligence was kept.");
          if (priorResearch.ok) {
            opportunityIntelligence = attachResearchProof(
              buildOpportunityIntelligence(
                intelligenceLead,
                vertical,
                client,
                priorResearch.handoff.signals,
                priorResearch.handoff.itResearch,
              ),
              req.clientId,
              intelligenceLead,
              client,
            );
          } else if (lead.opportunityIntelligence?.itResearch) {
            warnings.push("Refresh opportunity research before saving because its secure handoff is no longer valid.");
          }
        }
      }
      results.push({
        index,
        status: contactFound ? "enriched" : "not_found",
        contactName: p?.contactName ?? undefined,
        email: contactEmail,
        title: p?.title ?? undefined,
        contactMatch: p?.contactMatch,
        phone: p?.phone ?? undefined,
        linkedinUrl: p?.linkedinUrl ?? undefined,
        employeeCount,
        opportunityIntelligence,
        ...(warnings.length ? { researchWarning: warnings.join(" ") } : {}),
      });
    } catch (err) {
      logger.error({ phase, index, category: enrichmentErrorCategory(err) }, "Unexpected per-lead enrichment exception");
      results.push({ index, status: "failed", error: "Contact lookup could not be completed for this lead. Try again." });
    }
  };

  // Bounded concurrency (5 at a time) — same pattern as /prospects/bulk-enrich.
  const queue = leads.map((_, i) => i);
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const i = queue.shift();
      if (i !== undefined) await processOne(i);
    }
  }));

  results.sort((a, b) => a.index - b.index);
  // Outcome summary — the one line that tells us in production logs whether
  // Apollo enrichment is actually finding contacts (or why not).
  const counts = results.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
  const failureReasons = results.reduce<Record<string, number>>((acc, r) => {
    if (r.status === "failed") {
      const reason = r.error === runError && planBlocked ? "api_inaccessible" : enrichmentErrorCategory(new Error(r.error ?? ""));
      acc[reason] = (acc[reason] ?? 0) + 1;
    }
    return acc;
  }, {});
  logger.info({ requested: leads.length, outcomes: counts, failureReasons, planBlocked }, "Apollo enrichment run complete");
  return res.json({ results, planBlocked, ...(runError ? { error: runError } : {}) });
});

function splitResearchLocation(location?: string | null) {
  const parts = (location ?? "").split(",").map(part => part.trim()).filter(Boolean);
  const city = parts[0] || "";
  const state = parts.find(part => /^[A-Z]{2}$/i.test(part))?.toUpperCase() || "";
  return { city, state };
}

router.post("/opportunity-intelligence/refresh", requireEntitlement, async (req, res) => {
  const parsed = RefreshOpportunityIntelligenceBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Refresh request is invalid." });
  }
  const body = parsed.data;
  if (!body.selectedIndustry.trim() || (body.lead && !body.lead.companyName.trim())) {
    return res.status(400).json({ error: "Selected industry and company name must not be blank." });
  }
  if ((body.prospectId == null && !body.lead) || (body.prospectId != null && body.lead)) {
    return res.status(400).json({ error: "Provide exactly one of prospectId or lead." });
  }
  let [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client) return res.status(404).json({ error: "User settings could not be found." });
  client = await ensureCurrentSellerResearch(req.clientId, client);
  const sellerVertical = getVerticalConfig(client?.vertical).key;
  let savedProspect: typeof prospectsTable.$inferSelect | undefined;
  let lead: {
    companyName: string; website?: string | null; industry: string; city: string; state: string;
    employeeCount?: number | null; contactName?: string | null; contactTitle?: string | null; source?: string | null;
    address?: string | null; phone?: string | null;
  };
  if (body.prospectId != null) {
    [savedProspect] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, body.prospectId), prospectScope(req.clientId, client.vertical)));
    if (!savedProspect) return res.status(404).json({ error: "Prospect not found." });
    lead = {
      companyName: savedProspect.companyName,
      website: savedProspect.website,
      industry: savedProspect.industry,
      city: savedProspect.city,
      state: savedProspect.state,
      employeeCount: savedProspect.employeeCount,
      contactName: savedProspect.contactName,
      contactTitle: savedProspect.title,
      address: savedProspect.address,
      phone: savedProspect.phone,
    };
  } else {
    const requestLead = body.lead!;
    const location = splitResearchLocation(requestLead.location);
    lead = {
      companyName: requestLead.companyName,
      website: requestLead.website,
      industry: requestLead.industry || body.selectedIndustry,
      city: location.city,
      state: location.state,
      employeeCount: requestLead.employeeCount,
      contactName: requestLead.contactName,
      contactTitle: requestLead.contactTitle,
      source: requestLead.source,
    };
  }
  try {
    const startedAt = Date.now();
    req.log.info({ savedProspect: Boolean(savedProspect), sellerVertical }, "Opportunity intelligence refresh research started");
    const opportunityResearchStartedAt = Date.now();
    const opportunityResearch = researchItOpportunityIntelligence({
      clientId: req.clientId,
      lead,
      selectedIndustry: body.selectedIndustry,
      client,
      force: true,
      priorRecruiting: savedProspect?.opportunityIntelligence?.itResearch?.recruiting,
      // Client-supplied postings are discovery hints only. The research pipeline
      // must independently verify their employer, current status and citations.
      ...(sellerVertical === "recruiting_staffing" && body.discoveredHiring?.length
        ? { discoveredHiring: body.discoveredHiring } : {}),
    }).then(result => {
      req.log.info({ durationMs: Date.now() - opportunityResearchStartedAt, sellerVertical }, "Opportunity refresh web research phase completed");
      return result;
    });
    const breachStartedAt = Date.now();
    const breachResearch = researchPublicBreachRecords(lead).then(result => {
      req.log.info({ durationMs: Date.now() - breachStartedAt, sellerVertical }, "Opportunity refresh public-record phase completed");
      return result;
    });
    const [researched, publicBreachSignals] = await withResearchPipelineTimeout(Promise.all([
      opportunityResearch,
      breachResearch,
    ]));
    req.log.info({ durationMs: Date.now() - startedAt, savedProspect: Boolean(savedProspect), sellerVertical }, "Opportunity intelligence refresh research completed");
    const signals = [...researched.signals, ...publicBreachSignals];
    const opportunityIntelligence = attachResearchProof(
      buildOpportunityIntelligence(lead, sellerVertical, client, signals, researched.itResearch),
      req.clientId, lead, client,
    );
    cacheTrustedItResearch(req.clientId, lead, body.selectedIndustry, client, {
      itResearch: researched.itResearch,
      signals,
    });
    if (savedProspect) {
      // This only changes the independently-derived snapshot, avoiding a
      // concurrent user's edits to contact or prospect fields.
      const [updated] = await db.update(prospectsTable)
        .set({ opportunityIntelligence })
        .where(and(eq(prospectsTable.id, savedProspect.id), eq(prospectsTable.clientId, req.clientId)))
        .returning({ id: prospectsTable.id });
      if (!updated) return res.status(404).json({ error: "Prospect not found." });
    }
    // Recheck the original filters instead of retaining a stale review-only
    // flag after successful research. Radius needs a new geocoded job search;
    // do not clear that flag from client-supplied posting locations alone.
    const context = body.searchContext;
    let outsideSelectedFilters: boolean | undefined;
    if (sellerVertical === "recruiting_staffing" && context && !context.recruitingFilters?.radiusMiles) {
      const filters = context.recruitingFilters;
      const minimum = Math.max(1, filters?.minRelevantJobs ?? 1);
      outsideSelectedFilters = !(eligibleHiringResearch(opportunityIntelligence.itResearch?.recruiting,
        opportunityIntelligence.itResearch?.industryRelationship === "match"
        && Boolean(opportunityIntelligence.itResearch?.recommendations.length))
        && filterRecruitingOpportunity(opportunityIntelligence, {
        ...filters, minRelevantJobs: minimum,
      }, lead) && opportunityIntelligence.itResearch?.industryRelationship === "match"
        && (opportunityIntelligence.itResearch.recruiting?.jobs.filter(job =>
          matchesHiringJob(job, filters) && jobInSearchArea(job, context)).length ?? 0) >= minimum);
    }
    return res.json({ opportunityIntelligence,
      ...(outsideSelectedFilters !== undefined ? { outsideSelectedFilters } : {}),
    });
  } catch (err) {
    const timedOut = err instanceof ItOpportunityResearchTimeoutError;
    req.log.warn({ err, timedOut, sellerVertical }, "Opportunity intelligence refresh failed");
    return res.status(timedOut ? 504 : 502).json({
      error: err instanceof ItOpportunityResearchError
        ? err.message
        : "Current opportunity research could not be completed. Existing saved intelligence was not changed.",
    });
  }
});

export default router;

// ── Test-only exports ─────────────────────────────────────────────────────────
export { placeToLeadBase, addFleetOverlay, websiteDomain, searchRealBusinesses, ProspectSearchError, splitResearchLocation };
export type { PlaceResult };
