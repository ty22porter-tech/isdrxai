import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GenerateEmailBody, GenerateCallScriptBody, ProspectSearchBody, EnrichLeadsBody } from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";
import { enrichPerson } from "../lib/apollo";
import { logger } from "../lib/logger";
import {
  genericOutreach,
  industryMatch,
  potentialNeedsForSeller,
  sellerIntelligenceProfile,
} from "../lib/prospectMatching";
import { buildOpportunityIntelligence } from "../lib/opportunityIntelligence";
import { researchOfficialWebsite } from "../lib/officialWebsiteResearch";

const router = Router();
router.use(requireAuth, requireEntitlement);

function generatePersonalizedEmail(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, tone: string = "professional") {
  const { companyName, contactName, industry, city, state, squareFootage, employeeCount } = prospect;
  const firstName = contactName.split(" ")[0];
  const seller = sellerIntelligenceProfile(client);
  const senderName = client?.senderName?.trim() || seller.name || "our team";
  const businessName = seller.name || "our team";
  const sq = squareFootage ? `${squareFootage.toLocaleString()} sq ft` : null;
  const emp = employeeCount ? `${employeeCount}-person` : null;
  const vertical = getVerticalConfig(client?.vertical).key;

  const offering = seller.services[0] || seller.capabilities[0] || "a relevant solution";
  const subjects = [`A question about ${companyName}`, `${companyName} and ${industry}`, `${offering} for ${companyName}`];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const openings = tone === "casual"
    ? [`Hey ${firstName},`, `Hi ${firstName},`]
    : [`Dear ${firstName},`, `Hello ${firstName},`];
  const opening = openings[Math.floor(Math.random() * openings.length)];

  const match = industryMatch(industry, vertical);
  const sellerOffers = [...seller.capabilities, ...seller.services, ...seller.products, ...seller.valuePropositions];
  const claims = seller.ready
    ? `${businessName} offers ${sellerOffers.slice(0, 3).join(", ")}.${seller.differentiators[0] ? ` ${seller.differentiators[0]}.` : ""}`
    : "I’m reaching out with a brief, discovery-led question rather than assuming what solution would fit.";
  const body = `${opening}

${match.operation} ${companyName}'s specific situation is something we'd want to understand rather than assume.

${claims}

Would you be open to a short conversation about ${match.challenges[0]}${seller.ctas[0] ? ` — ${seller.ctas[0]}` : "?"}`;

  return { subject, body };
}

function generateCallScript(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, objective: string = "set appointment") {
  const { companyName, contactName, industry, city, squareFootage } = prospect;
  const firstName = contactName.split(" ")[0];
  const senderName = client?.senderName?.trim() || client?.businessName?.trim() || "our team";
  const businessName = client?.businessName?.trim() || "our company";
  const sq = squareFootage ? `your ${squareFootage.toLocaleString()} sq ft space` : `your facility`;
  const vertical = getVerticalConfig(client?.vertical).key;

  if (vertical === "it_services") {
    const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out to ${industry} businesses in ${city} — I'll keep this brief, I promise. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"We're a managed IT services provider working with ${industry} companies, and I noticed ${companyName} is in ${city}. A lot of our clients had the same situation — slow support from their current IT provider, growing security worries, or Microsoft 365 licensing costs creeping up.

We cover everything under one roof: Cybersecurity, MS365 Licenses, Managed IT Services, Managed Security Services, and Mobile Device Management — so every laptop, phone, and server your team touches is secure and supported.

The reason I'm calling is to see if it'd make sense to do a free IT assessment for ${companyName}. It's free, takes about 30 minutes, and you'll walk away with a clear picture of your security gaps and where you might be overspending."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a quick assessment call this week — say Tuesday or Thursday afternoon?` : `Can I send you some information about what we do for ${industry} businesses in ${city}?`}"`;

    const keyPoints = [
      `Mention ${industry}-specific experience and local ${city} presence upfront`,
      `Lead with security risk and IT cost savings — most common pain points`,
      `Name the five offerings: Cybersecurity, MS365 Licenses, Managed IT, Managed Security, MDM`,
      `Keep the ask small: a free 30-minute IT assessment, not a commitment`,
      `Always confirm a specific day/time, not an open-ended "sometime this week"`,
    ];

    const objectionHandlers = [
      {
        objection: "We already have an IT provider",
        response: `"That's great to hear — most of our best clients did too before they switched. Can I ask, are you fully satisfied with response times and how proactive they are on security? We often do a complimentary side-by-side assessment — no pressure, just good info to have."`,
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
        response: `"Totally fair — contracts are there for a reason. When does that come up for renewal? I'd love to be on your radar so we can put together a proposal when the time is right. Would you be open to a free assessment just to have options?"`,
      },
      {
        objection: "Too busy right now",
        response: `"Understood — I'll be quick. The assessment only takes 30 minutes and we do most of it remotely. Would early morning or end of day work better so it doesn't cut into your schedule?"`,
      },
    ];

    return { script, keyPoints, objectionHandlers };
  }

  const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out to ${industry} businesses in ${city} — I'll keep this brief, I promise. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"We specialize in commercial cleaning for ${industry} companies, and I noticed ${companyName} is in ${city}. A lot of our clients had the same situation — their current cleaning wasn't consistent, or they were overpaying for a generic service.

We've helped similar businesses in the area cut their cleaning costs by 20-30% while getting more reliable results. We do everything — nightly cleaning, floor care, restroom sanitation, window cleaning — and every crew member is bonded and background-checked.

The reason I'm calling is to see if it'd make sense to do a quick walkthrough of ${sq}. It's free, takes about 20 minutes, and I can give you a firm quote on the spot."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a site visit this week — say Tuesday or Thursday afternoon?` : `Can I send you some information about what we do for ${industry} businesses in ${city}?`}"`;

  const keyPoints = [
    `Mention ${industry}-specific experience and local ${city} presence upfront`,
    `Lead with cost savings (20-30%) and reliability — most common pain points`,
    `Keep the ask small: a 20-minute walkthrough, not a commitment`,
    `Reference that the quote is free and on-the-spot to reduce friction`,
    `Always confirm a specific day/time, not an open-ended "sometime this week"`,
  ];

  const objectionHandlers = [
    {
      objection: "We already have a cleaning company",
      response: `"That's great to hear — most of our best clients did too before they switched. Can I ask, are you fully satisfied with the consistency and communication? We often do a complimentary side-by-side quote — no pressure, just good info to have."`,
    },
    {
      objection: "We're not interested / not looking right now",
      response: `"I completely understand, ${firstName}. Timing is everything. Would it be okay if I followed up in a couple months? And if anything changes before then, I'll make sure you have my direct number."`,
    },
    {
      objection: "Send me information by email",
      response: `"Absolutely, I'll send that right over. What's the best email for you? And just so the info is relevant — roughly how large is ${sq}? That helps me tailor what I send."`,
    },
    {
      objection: "We're under contract",
      response: `"Totally fair — contracts are there for a reason. When does that come up for renewal? I'd love to be on your radar so we can put together a proposal when the time is right. Would you be open to a 10-minute walkthrough just to have options?"`,
    },
    {
      objection: "Too busy right now",
      response: `"Understood — I'll be quick. The walkthrough only takes 20 minutes and I come to you. Would early morning or end of day work better so it doesn't cut into your schedule?"`,
    },
  ];

  return { script, keyPoints, objectionHandlers };
}

router.post("/generate-email", requireEntitlement, async (req, res) => {
  const body = GenerateEmailBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const result = generatePersonalizedEmail(prospect, client, body.tone);
  return res.json(result);
});

router.post("/generate-call-script", requireEntitlement, async (req, res) => {
  const body = GenerateCallScriptBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const result = generateCallScript(prospect, client, body.objective);
  return res.json(result);
});

// ─── IT-services enrichment overlay ──────────────────────────────────────────
// Google Places gives us real business identity (name, address, phone, website)
// but not employee count or compliance profile. We overlay industry-derived IT
// scoring, compliance, needs, and outreach fields so the UI contract is
// preserved for IT-services users. Scoring is intentionally marked as estimated.

const IT_COMPLIANCE: Record<string, string> = {
  Healthcare: "Likely HIPAA and HITECH-related security requirements",
  "Financial Services": "Likely GLBA and FTC Safeguards Rule obligations; potential SOC 2 expectations",
  Insurance: "Likely FTC Safeguards Rule and state data privacy requirements",
  Retail: "Likely PCI DSS payment security requirements",
  Hospitality: "Likely PCI DSS payment security and guest data privacy requirements",
  Manufacturing: "Potential NIST 800-171 / CMMC requirements if serving government supply chains",
  Construction: "Potential NIST 800-171 / CMMC requirements for government contract work",
  Logistics: "Potential supply-chain security and cyber-insurance requirements",
  Nonprofit: "Likely donor data privacy and cyber-insurance security requirements",
  Commercial: "Potential state privacy and cyber-insurance security requirements",
  "Real Estate": "Likely wire-fraud prevention and state privacy requirements",
};

const IT_NEEDS: Record<string, string[]> = {
  Healthcare: ["Managed IT","Cybersecurity assessment","HIPAA compliance support","Backup and disaster recovery","Microsoft 365 management"],
  "Financial Services": ["Cybersecurity","Compliance consulting","Managed IT","Email security and Microsoft 365","Backup and disaster recovery"],
  Insurance: ["Cybersecurity","Compliance support","Managed IT","Microsoft 365 licensing","VoIP and unified communications"],
  Retail: ["Network management","Cybersecurity and PCI support","Managed IT","Help-desk support","VoIP"],
  Hospitality: ["Guest Wi-Fi and network management","Cybersecurity","Managed IT","VoIP","Help-desk support"],
  Manufacturing: ["Managed IT","OT/IT network security","Cybersecurity assessment","Backup and disaster recovery","Compliance consulting"],
  Construction: ["Mobile device management","Managed IT","Cybersecurity","Cloud services","Microsoft 365"],
  Logistics: ["Network management","Mobile device management","Cybersecurity","Managed IT","Backup and disaster recovery"],
  Nonprofit: ["Managed IT","Microsoft 365 nonprofit licensing","Cybersecurity awareness training","Cloud services","Backup and disaster recovery"],
  Commercial: ["Managed IT","Cybersecurity","Microsoft 365","Help-desk support","Network management"],
  "Real Estate": ["Managed IT","Cybersecurity and wire-fraud prevention","Microsoft 365","Cloud services","Mobile device management"],
};

const IT_WHY: Record<string, string[]> = {
  Healthcare: ["Compliance-sensitive practice — likely needs security and HIPAA support beyond in-house capacity","Patient systems demand uptime; likely candidate for proactive managed IT"],
  "Financial Services": ["Handles sensitive financial data — likely cybersecurity and compliance need","Client trust depends on secure email and document handling"],
  Insurance: ["Client PII handling suggests likely compliance and security needs","Cyber-insurance carriers increasingly require security controls"],
  Retail: ["Payment processing implies likely PCI security needs","Seasonal staffing makes help-desk outsourcing attractive"],
  Hospitality: ["Guest Wi-Fi and payment systems create likely security needs","High staff turnover suggests security awareness training need"],
  Manufacturing: ["Production downtime risk makes managed security a likely fit","Potential government supply-chain compliance requirements"],
  Construction: ["Field teams on mobile devices suggest MDM needs","Project data in the cloud implies backup and security needs"],
  Logistics: ["Warehouse systems and scanners imply device management needs","Operational downtime is costly — proactive IT is a likely fit"],
  Nonprofit: ["Limited budgets favor outsourced IT over internal hires","Eligible for nonprofit licensing — cost-savings angle"],
  Commercial: ["Mid-sized operations typically lack dedicated IT staff","Growing businesses face increasing cyber-insurance requirements"],
  "Real Estate": ["Wire-transfer fraud risk makes email security a likely priority","Transaction data privacy expectations are rising"],
};

const IT_OUTREACH: Record<string, string> = {
  Healthcare: "Offer a cybersecurity and compliance readiness assessment tailored to medical operations",
  "Financial Services": "Offer a compliance readiness review covering GLBA / FTC Safeguards controls",
  Insurance: "Offer a cyber-insurance readiness review and security gap assessment",
  Retail: "Offer a network and payment-security assessment across locations",
  Hospitality: "Offer a guest network and payment-security technology assessment",
  Manufacturing: "Offer a discovery call on OT/IT security and supply-chain compliance readiness",
  Construction: "Offer a technology assessment covering field devices and project-data protection",
  Logistics: "Offer a network assessment covering warehouse systems and device management",
  Nonprofit: "Offer an IT consultation highlighting nonprofit licensing savings and security basics",
  Commercial: "Offer a free technology assessment to benchmark IT support and security posture",
  "Real Estate": "Offer a cybersecurity assessment focused on wire-fraud prevention",
};

const IT_COMPLIANCE_SENSITIVE = new Set(["Healthcare","Financial Services","Insurance","Retail","Manufacturing","Construction","Nonprofit"]);

/** Deterministic hash-based rng seeded from a string, so scores are stable per company name. */
function strRng(seed: string) {
  let h = 0;
  for (const c of seed) { h = ((h << 5) - h + c.charCodeAt(0)) | 0; }
  return () => { h = (h * 1664525 + 1013904223) & 0xffffffff; return Math.abs(h) / 0x7fffffff; };
}

type BaseLead = ReturnType<typeof placeToLeadBase>;

function addItOverlay(lead: BaseLead, industry: string, _employeeRange?: string, _compliancePriority?: string, client?: typeof usersTable.$inferSelect) {
  const rng = strRng(lead.companyName);
  const seller = sellerIntelligenceProfile(client);
  const isCompliance = IT_COMPLIANCE_SENSITIVE.has(industry);
  const complianceScore = isCompliance ? 14 : 6 + Math.floor(rng() * 6);
  const managedItScore = seller.ready ? 12 + Math.floor(rng() * 8) : 6 + Math.floor(rng() * 6);
  const cyberScore = 8 + Math.floor(rng() * 9);
  const growthScore = Math.floor(rng() * 11);
  const opportunityScore = Math.min(100, 15 + complianceScore + managedItScore + cyberScore + growthScore);
  const scoreLabel = opportunityScore >= 80 ? "High Priority" : opportunityScore >= 60 ? "Strong Fit" : opportunityScore >= 40 ? "Possible Fit" : "Low Priority";
  const complianceConsideration = IT_COMPLIANCE[industry] ?? "Potential state privacy and cyber-insurance security requirements";
  const potentialNeeds = seller.ready
    ? potentialNeedsForSeller(client, industry, "it_services")
    : ["Confirm operational priorities", "Understand current support approach", "Determine whether a relevant seller solution is needed"];
  const whyTarget = `${lead.companyName} is a verified ${industry} business. ${industryMatch(industry, "it_services").operation} ${seller.ready ? `${seller.name}'s configured capabilities may be relevant after discovery.` : "Seller capabilities are not configured, so no service fit is assumed."}`;
  const scoreExplanation = [
    `Real ${industry} business found via Google Places.`,
    isCompliance ? "Compliance-sensitive industry — elevated security scoring applied." : "Industry scoring based on typical IT needs.",
    "Employee count and location count are not confirmed from public data.",
    "IT Opportunity Score is an estimate based on industry profile.",
  ].join(" ");

  return {
    ...lead,
    whyTarget,
    vertical: "it_services" as const,
    opportunityScore,
    scoreLabel,
    scoreExplanation,
    potentialNeeds,
    complianceConsideration,
    recommendedOutreach: genericOutreach(client, industry, "it_services"),
  };
}

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
  const scoreLabel = opportunityScore >= 80 ? "High Priority" : opportunityScore >= 60 ? "Strong Fit" : opportunityScore >= 40 ? "Possible Fit" : "Low Priority";
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

async function searchRealBusinesses(apiKey: string, city: string, state: string, industry: string, count: number): Promise<PlaceResult[]> {
  const industryLabel = industry && industry !== "All Industries" ? `${industry} ` : "";
  const textQuery = `${industryLabel}businesses in ${city}, ${state}`;

  const resp = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus",
    },
    body: JSON.stringify({ textQuery, pageSize: Math.min(count, 20) }),
  });

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
    throw new ProspectSearchError(502, `Google Places search failed (HTTP ${resp.status}).${detail ? ` Details: ${detail}` : ""}`);
  }

  const data = await resp.json() as { places?: PlaceResult[] };
  return (data.places ?? []).filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL");
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
  const whyTarget = `${industryLabel} companies in ${city}, ${state} are a strong fit for recurring commercial service contracts — they have facilities to maintain and typically rely on outside vendors for upkeep.${fitText}`;

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

router.post("/prospect-search", requireEntitlement, async (req, res) => {
  const body = ProspectSearchBody.parse(req.body);
  const count = Math.min(body.count, 20);
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client?.website) {
    return res.status(409).json({
      error: "Add your company website in Settings before generating new prospects so iSDRX AI can learn your business and personalize prospecting.",
      code: "COMPANY_WEBSITE_REQUIRED",
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Real business search isn't set up yet: the GOOGLE_MAPS_API_KEY secret is missing. Add your Google Maps API key (with the Places API enabled) to search real local businesses.",
    });
  }

  const vertical = getVerticalConfig(client?.vertical).key;

  try {
    const places = await searchRealBusinesses(apiKey, body.city.trim(), body.state, body.industry, count);
    const bases = places.slice(0, count).map((p) => placeToLeadBase(p, body.city.trim(), body.state, body.industry, vertical));

    const leads = await Promise.all(bases.map(async (base) => {
      const lead = vertical === "it_services"
        ? addItOverlay(base, body.industry, body.employeeRange ?? undefined, body.compliancePriority ?? undefined, client)
        : vertical === "fleet_wraps"
          ? addFleetOverlay(base, body.industry, client)
          : base;
      const researchedSignals = await researchOfficialWebsite(lead);
      const opportunityIntelligence = buildOpportunityIntelligence(lead, vertical, client, researchedSignals);
      return {
        ...lead,
        opportunityScore: opportunityIntelligence.score,
        scoreLabel: opportunityIntelligence.label,
        scoreExplanation: opportunityIntelligence.definition,
        whyTarget: opportunityIntelligence.whyTarget,
        potentialNeeds: opportunityIntelligence.potentialNeeds,
        recommendedOutreach: opportunityIntelligence.recommendedOutreach,
        opportunityIntelligence,
      };
    }));

    // Strongest seller-specific opportunities first. This never uses engagement.
    leads.sort((a: any, b: any) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
    return res.json(leads);
  } catch (err) {
    if (err instanceof ProspectSearchError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("prospect-search failed:", err);
    return res.status(502).json({ error: "Could not reach Google Places. Please try again in a moment." });
  }
});

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
  opportunityScore?: number;
  scoreLabel?: string;
  whyTarget?: string;
  potentialNeeds?: string[];
  recommendedOutreach?: string;
  opportunityIntelligence?: ReturnType<typeof buildOpportunityIntelligence>;
  error?: string;
};

router.post("/enrich-leads", requireEntitlement, async (req, res) => {
  const { leads } = EnrichLeadsBody.parse(req.body);

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const vertical = getVerticalConfig(client?.vertical).key;

  const results: EnrichLeadResult[] = [];
  let planBlocked = false;
  let runError: string | undefined;

  const processOne = async (index: number) => {
    if (planBlocked) {
      results.push({ index, status: "failed", error: runError });
      return;
    }
    const lead = leads[index];
    const result = await enrichPerson({
      email: lead.email,
      contactName: lead.contactName ?? null,
      companyName: lead.companyName,
      website: lead.website ?? null,
      vertical,
    });
    if (!result.ok) {
      if (result.planBlocked) {
        planBlocked = true;
        runError = result.error;
      }
      results.push({ index, status: "failed", error: result.error });
      return;
    }
    const p = result.person;
    // "Enriched" requires at least a real name or a real email — anything less
    // is a not-found so the UI never claims a contact it doesn't have.
    if (!p || (!p.contactName && !p.email)) {
      results.push({ index, status: "not_found" });
      return;
    }
    const enrichedLead = {
      companyName: lead.companyName,
      contactTitle: p.title ?? lead.contactTitle ?? null,
      industry: lead.industry || "Local business",
      city: lead.city || "",
      state: lead.state || "",
      address: lead.address ?? null,
      website: lead.website ?? null,
      phone: p.phone ?? lead.phone ?? null,
    };
    const researchedSignals = await researchOfficialWebsite(enrichedLead);
    const refreshedIntelligence = buildOpportunityIntelligence(
      enrichedLead,
      vertical,
      client,
      researchedSignals,
    );
    results.push({
      index,
      status: "enriched",
      contactName: p.contactName ?? undefined,
      email: p.email ?? undefined,
      title: p.title ?? undefined,
      phone: p.phone ?? undefined,
      linkedinUrl: p.linkedinUrl ?? undefined,
      employeeCount: p.employeeCount ?? undefined,
      opportunityScore: refreshedIntelligence.score,
      scoreLabel: refreshedIntelligence.label,
      whyTarget: refreshedIntelligence.whyTarget,
      potentialNeeds: refreshedIntelligence.potentialNeeds,
      recommendedOutreach: refreshedIntelligence.recommendedOutreach,
      opportunityIntelligence: refreshedIntelligence,
    });
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
  logger.info({ leads: leads.length, ...counts, planBlocked, ...(runError ? { error: runError } : {}) }, "Apollo enrichment run complete");
  return res.json({ results, planBlocked, ...(runError ? { error: runError } : {}) });
});

export default router;

// ── Test-only exports ─────────────────────────────────────────────────────────
export { placeToLeadBase, addItOverlay, addFleetOverlay, websiteDomain, searchRealBusinesses, ProspectSearchError };
export type { PlaceResult };
