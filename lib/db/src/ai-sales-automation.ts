/** Buyer sectors: these never change the seller's selling industry. */
export const AI_SALES_BUYER_INDUSTRIES = [
  "Recruiting & Staffing", "Technology", "IT Services", "Marketing Agencies",
  "Professional Services", "Manufacturing", "Logistics & Warehousing",
  "Commercial Real Estate", "Business Consulting", "Wholesale Distribution",
];

export const AI_SALES_DESCRIPTION = "A virtual sales employee designed to autonomously handle daily prospecting, personalized outreach and follow-up, helping generate appointments, sales opportunities and revenue growth while potentially reducing the expense of filling that role.";

export const COST_COMPARISON_HELP = "To enable the seller-provided ‘up to 65% savings’ claim, add a Proof Point using this format: AI Sales cost comparison | baseline annual cost: 100000 | software annual cost: 35000 | basis: like-for-like role scope including all software and operating costs | source: https://your-evidence-url. Replace every example with your supported comparison. This is seller-provided evidence, not verified prospect spending or a guaranteed outcome.";

type SalesProfile = {
  sellerIndustry?: string;
  sellerCompanyName?: string | null;
  sellerProofPoints?: string[];
  userOverrides?: { sellerProofPoints?: string[] };
};

/** Explicit, seller-configured evidence only; a marketing percentage is insufficient.
 * Costs must share an annual, like-for-like basis and support at least 65%.
 * This checks configuration and arithmetic, not the truth of the source document.
 */
export function salesCostComparison(profile?: SalesProfile | null) {
  if (profile?.sellerIndustry !== "ai_sales_automation") return undefined;
  for (const proof of profile.userOverrides?.sellerProofPoints ?? []) {
    const match = proof.match(/^AI Sales cost comparison\s*\|\s*baseline annual cost:\s*(\d+(?:\.\d+)?)\s*\|\s*software annual cost:\s*(\d+(?:\.\d+)?)\s*\|\s*basis:\s*([^|]+)\|\s*source:\s*(https:\/\/\S+)\s*$/i);
    if (!match) continue;
    const baseline = Number(match[1]);
    const software = Number(match[2]);
    if (!Number.isFinite(baseline) || !Number.isFinite(software) || baseline <= 0 || software <= 0 || (baseline - software) / baseline < 0.65 || match[3].trim().length < 30) continue;
    try {
      const source = new URL(match[4]);
      if (!source.hostname.includes(".") || source.username || source.password) continue;
      return { baseline, software, basis: match[3].trim(), source: source.href };
    } catch { /* invalid source */ }
  }
  return undefined;
}

export function configuredSalesBookingUrl(value?: string | null): string | undefined {
  try {
    const url = new URL(value?.trim() || "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function salesAutomationEmailRules(client?: { vertical?: string | null; calendlyUrl?: string | null; sellerIntelligenceProfile?: SalesProfile | null }) {
  if (client?.vertical !== "ai_sales_automation") return "";
  const evidence = salesCostComparison(client.sellerIntelligenceProfile);
  return `AI SALES AUTOMATION EMAIL RULES:
${AI_SALES_DESCRIPTION}
Sell this software to the prospect business, never the prospect's own services. Staffing agencies are software buyers, not employers seeking staffing help.
Use the actual configured seller company name. Write warm, human, varied prose. Explain finding prospects, personalized outreach and follow-up as one autonomous daily workflow. Mention potential lower role costs conditionally; never invent a prospect's spending, salary, current process, sales problem or ROI. Never guarantee appointments, revenue or savings. Invite a 15-minute conversation, with only one natural question. Vary openings, transitions and subjects across drafts and follow-ups.
${evidence ? `The seller has configured a cost comparison: baseline annual cost ${evidence.baseline}; software annual cost ${evidence.software}; basis: ${evidence.basis}. These are seller comparison assumptions, NOT this prospect's spending. You may use exactly: “Depending on your current process and costs, we could help you save up to 65%.” This is a seller-provided claim, never a guarantee. Do not include comparison amounts as prospect facts.` : "No supporting seller cost comparison is configured. Omit ALL numerical or percentage savings claims, including up to 65%, even if other seller fields or campaign instructions mention them."}
${configuredSalesBookingUrl(client.calendlyUrl) ? "The seller has a booking link. You may reference the booking link below; the email composer adds the real configured link." : "No booking link is configured. Ask for a reply; never mention a calendar below, a booking link or automatic scheduling."}
Never write a raw URL or invent a calendar URL. The email composer owns links.`;
}

/** Fail closed after generation as well as at composition, including saved drafts. */
export function assertSalesAutomationEmail(text: string, client?: { vertical?: string | null; calendlyUrl?: string | null; sellerIntelligenceProfile?: SalesProfile | null }) {
  if (client?.vertical !== "ai_sales_automation") return;
  if (/https?:\/\/|www\.|\b(?:calendly\.com|calendar\.google\.com)\b/i.test(text)) throw new Error("AI Sales Automation drafts must leave booking URLs to the email composer.");
  const numbers = text.match(/\b\d+(?:\.\d+)?\s*(?:%|percent\b)|\$\s*\d[\d,.]*/gi) ?? [];
  if (numbers.length && (!salesCostComparison(client.sellerIntelligenceProfile)
    || numbers.some(value => value.replace(/\s+/g, "") !== "65%")
    || !/depending on your current process and costs, we could help you save up to 65%/i.test(text))) {
    throw new Error("Savings claims require the configured supporting cost comparison and conditional up-to wording.");
  }
  if (/\bguarantee(?:d|s)?\b|\b(?:will|always)\s+(?:save|reduce|generate|deliver)\b|\byou(?:'re| are)\s+(?:spending|paying)\b/i.test(text)) throw new Error("Sales automation copy cannot guarantee outcomes or invent prospect spending.");
  if (!configuredSalesBookingUrl(client.calendlyUrl) && /\b(?:calendar below|book(?:ing)? (?:a time|link)|schedule (?:below|using|via)|calendar link)\b/i.test(text)) throw new Error("Configure the seller's booking link before referencing a calendar.");
}

export function isSalesBuyerContact(title?: string | null): boolean {
  const value = title?.trim() || "";
  if (!value || /pending|unknown|unverified/i.test(value)) return false;
  return /\b(?:owner|founder|ceo|chief executive officer|chief revenue officer|president)\b/i.test(value)
    || (/\b(?:sales|business development)\b/i.test(value)
      && /\b(?:chief|vp|vice president|head|director|manager|lead|leader)\b/i.test(value));
}
