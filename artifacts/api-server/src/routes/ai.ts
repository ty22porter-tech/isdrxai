import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GenerateEmailBody, GenerateCallScriptBody, ProspectSearchBody } from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";

const router = Router();
router.use(requireAuth);

function generatePersonalizedEmail(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, tone: string = "professional") {
  const { companyName, contactName, industry, city, state, squareFootage, employeeCount } = prospect;
  const firstName = contactName.split(" ")[0];
  const senderName = client?.senderName?.trim() || client?.businessName?.trim() || "our team";
  const businessName = client?.businessName?.trim() || "our company";
  const sq = squareFootage ? `${squareFootage.toLocaleString()} sq ft` : null;
  const emp = employeeCount ? `${employeeCount}-person` : null;
  const vertical = getVerticalConfig(client?.vertical).key;

  const subjects = vertical === "it_services"
    ? [
        `Managed IT proposal for ${companyName}`,
        `Keeping ${companyName} secure and supported — can we chat?`,
        `IT services tailored for ${industry} businesses in ${city}`,
        `Quick question about ${companyName}'s IT and security`,
      ]
    : [
        `Commercial cleaning proposal for ${companyName}`,
        `Keeping ${companyName} spotless — can we chat?`,
        `Janitorial services tailored for ${industry} facilities in ${city}`,
        `Quick question about ${companyName}'s facility maintenance`,
      ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const openings = tone === "casual"
    ? [`Hey ${firstName},`, `Hi ${firstName},`]
    : [`Dear ${firstName},`, `Hello ${firstName},`];
  const opening = openings[Math.floor(Math.random() * openings.length)];

  const facilityDetail = sq ? `your ${sq} facility` : `your ${city} location`;
  const facilityMention = sq ? `a ${sq} facility in ${city}` : `a facility in ${city}`;
  const companyDetail = emp ? `your ${emp} team` : `your team`;

  if (vertical === "it_services") {
    const teamMention = emp ? `a ${emp} team in ${city}` : `a team in ${city}`;
    const body = `${opening}

I hope this message finds you well. My name is ${senderName}, and I represent ${businessName} — a managed IT services provider working with ${industry} businesses across ${state}.

I noticed ${companyName} operates ${teamMention}, and I wanted to reach out about how we can keep your technology secure, compliant, and running smoothly so ${companyDetail} can stay focused on what you do best.

Here's what we bring to ${industry} companies like yours:
• Cybersecurity — protection against ransomware, phishing, and data breaches
• MS365 Licenses — right-sized licensing and full Microsoft 365 management
• Managed IT Services — proactive support, monitoring, and fast helpdesk response
• Managed Security Services — 24/7 threat monitoring and incident response
• Mobile Device Management — secure every laptop, phone, and tablet your team uses

We currently support several ${industry} businesses in ${city} and consistently receive 5-star reviews for responsiveness and reliability.

I'd love to schedule a free IT assessment for ${companyName} so we can put together a no-obligation recommendation tailored to your environment.

Would you have 15 minutes this week for a quick call?`;
    return { subject, body };
  }

  const body = `${opening}

I hope this message finds you well. My name is ${senderName}, and I represent ${businessName} — a commercial cleaning company specializing in ${industry} facilities across ${state}.

I noticed ${companyName} operates ${facilityMention}, and I wanted to reach out about how we can help keep your workspace in top condition so ${companyDetail} can stay focused on what you do best.

Here's what we bring to ${industry} companies like yours:
• Customized cleaning schedules (nightly, weekly, or as-needed)
• Fully bonded and insured crew with background checks
• Green cleaning products available upon request
• Dedicated account manager and 24/7 emergency response

We currently service several ${industry} businesses in ${city} and consistently receive 5-star reviews for reliability and attention to detail.

I'd love to schedule a free walkthrough of ${facilityDetail} so we can put together a no-obligation quote tailored to your specific needs.

Would you have 15 minutes this week for a quick call or site visit?`;

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

function addItOverlay(lead: BaseLead, industry: string, _employeeRange?: string, _compliancePriority?: string) {
  const rng = strRng(lead.companyName);
  const isCompliance = IT_COMPLIANCE_SENSITIVE.has(industry);
  const complianceScore = isCompliance ? 20 : 6 + Math.floor(rng() * 6);
  const managedItScore = 8 + Math.floor(rng() * 8);
  const cyberScore = isCompliance ? 14 + Math.floor(rng() * 7) : 8 + Math.floor(rng() * 9);
  const growthScore = Math.floor(rng() * 11);
  const opportunityScore = Math.min(100, 15 + complianceScore + managedItScore + cyberScore + growthScore);
  const scoreLabel = opportunityScore >= 80 ? "High Priority" : opportunityScore >= 60 ? "Strong Fit" : opportunityScore >= 40 ? "Possible Fit" : "Low Priority";
  const complianceConsideration = IT_COMPLIANCE[industry] ?? "Potential state privacy and cyber-insurance security requirements";
  const needsPool = IT_NEEDS[industry] ?? IT_NEEDS["Commercial"];
  const needStart = Math.floor(rng() * needsPool.length);
  const potentialNeeds = [0, 1, 2].map((o) => needsPool[(needStart + o) % needsPool.length]);
  const whyPool = IT_WHY[industry] ?? IT_WHY["Commercial"];
  const whyTarget = whyPool[Math.floor(rng() * whyPool.length)];
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
    recommendedOutreach: IT_OUTREACH[industry] ?? IT_OUTREACH["Commercial"],
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
    whyTarget: `Real ${industryLabel.toLowerCase()} business found via Google Places${place.formattedAddress ? ` at ${place.formattedAddress}` : ""}. Contact name and email are placeholders until enrichment runs.`,
    confidence,
    vertical,
  };
}

router.post("/prospect-search", requireEntitlement, async (req, res) => {
  const body = ProspectSearchBody.parse(req.body);
  const count = Math.min(body.count, 20);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Real business search isn't set up yet: the GOOGLE_MAPS_API_KEY secret is missing. Add your Google Maps API key (with the Places API enabled) to search real local businesses.",
    });
  }

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const vertical = getVerticalConfig(client?.vertical).key;

  try {
    const places = await searchRealBusinesses(apiKey, body.city.trim(), body.state, body.industry, count);
    const leads = places.slice(0, count).map((p) => {
      const base = placeToLeadBase(p, body.city.trim(), body.state, body.industry, vertical);
      return vertical === "it_services"
        ? addItOverlay(base, body.industry, body.employeeRange ?? undefined, body.compliancePriority ?? undefined)
        : base;
    });
    return res.json(leads);
  } catch (err) {
    if (err instanceof ProspectSearchError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("prospect-search failed:", err);
    return res.status(502).json({ error: "Could not reach Google Places. Please try again in a moment." });
  }
});

export default router;

// ── Test-only exports ─────────────────────────────────────────────────────────
export { placeToLeadBase, addItOverlay, websiteDomain, searchRealBusinesses, ProspectSearchError };
export type { PlaceResult };
