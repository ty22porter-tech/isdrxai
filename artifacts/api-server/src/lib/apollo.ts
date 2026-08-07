import { logger } from "./logger";

/**
 * Apollo.io people enrichment client.
 *
 * Requires APOLLO_API_KEY. Apollo blocks ALL API access on the Free plan —
 * calls return 403 API_INACCESSIBLE until the account is on any paid plan.
 * We surface that as { planBlocked: true } so the UI can explain it nicely.
 *
 * Enrichment strategy:
 *  1. If the prospect already has a real (non-placeholder) email, use
 *     /people/match to look them up directly and pull back name + contact info.
 *  2. If the email is a .invalid placeholder (prospects from Google Maps search),
 *     use /mixed_people/search to find the most-likely decision-maker at that
 *     company (facilities manager for janitorial, IT manager for IT, etc.)
 *     and return their name + email so outreach can actually reach someone.
 */

export interface ApolloEnrichment {
  /** Decision-maker's full name (filled when missing/placeholder). */
  contactName: string | null;
  /** Decision-maker's verified work email (filled when placeholder). */
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  employeeCount: number | null;
}

export type ApolloResult =
  | { ok: true; person: ApolloEnrichment | null }
  | { ok: false; planBlocked: boolean; error: string };

/** Only accept https LinkedIn profile URLs — vendor data goes straight into an <a href>. */
export function sanitizeLinkedinUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Returns true for placeholder emails that were generated because no real address was known. */
export function isPlaceholderEmail(email: string): boolean {
  if (!email) return true;
  // .invalid TLD is reserved (RFC 2606) and used as our placeholder sentinel.
  if (email.endsWith(".invalid")) return true;
  return false;
}

/** Best-guess decision-maker titles by vertical, ordered by preference. */
const DECISION_MAKER_TITLES: Record<string, string[]> = {
  janitorial: [
    "facilities manager",
    "office manager",
    "property manager",
    "building manager",
    "operations manager",
    "facility manager",
  ],
  it_services: [
    "it manager",
    "it director",
    "chief information officer",
    "cio",
    "director of information technology",
    "technology manager",
    "systems administrator",
    "network administrator",
    "office manager",
  ],
};

function extractPersonFromApolloData(p: any): ApolloEnrichment {
  const org = p.organization ?? {};

  // Build full name from whichever fields Apollo returns.
  const fullName =
    p.name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    null;

  // Apollo may return the work email in different locations.
  const workEmail =
    p.email?.trim() ||
    p.contact?.email_addresses?.[0]?.email?.trim() ||
    null;

  const phone =
    p.contact?.sanitized_phone ||
    p.sanitized_phone ||
    org.sanitized_phone ||
    org.phone ||
    null;

  return {
    contactName: fullName,
    email: workEmail && !isPlaceholderEmail(workEmail) ? workEmail : null,
    title: p.title ?? null,
    linkedinUrl: sanitizeLinkedinUrl(p.linkedin_url),
    phone,
    city: p.city ?? org.city ?? null,
    state: p.state ?? org.state ?? null,
    website: org.website_url ?? null,
    employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
  };
}

/** Shared error handler for Apollo HTTP responses. Returns null when the caller should proceed. */
async function handleApolloError(res: Response): Promise<ApolloResult | null> {
  if (res.status === 403) {
    const text = await res.text().catch(() => "");
    const planBlocked = text.includes("API_INACCESSIBLE");
    return {
      ok: false,
      planBlocked,
      error: planBlocked
        ? "Apollo's API is not available on your current (Free) Apollo plan. Upgrade to any paid Apollo plan to enable enrichment."
        : "Apollo rejected the API key (403).",
    };
  }
  if (res.status === 429) {
    return { ok: false, planBlocked: false, error: "Apollo rate limit reached — try again in a minute." };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: text.slice(0, 300) }, "Apollo enrichment unexpected response");
    return { ok: false, planBlocked: false, error: `Apollo returned ${res.status}` };
  }
  return null; // no error
}

/**
 * Look up a person by email using Apollo's /people/match endpoint.
 * Best for prospects that already have a real email but are missing title/LinkedIn.
 */
async function matchByEmail(apiKey: string, input: {
  email: string;
  contactName?: string | null;
  companyName?: string | null;
}): Promise<ApolloResult> {
  const [firstName, ...rest] = (input.contactName ?? "").trim().split(/\s+/);
  const body: Record<string, unknown> = {
    email: input.email,
    reveal_personal_emails: false,
  };
  if (firstName) body.first_name = firstName;
  if (rest.length) body.last_name = rest.join(" ");
  if (input.companyName) body.organization_name = input.companyName;

  let res: Response;
  try {
    res = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    return { ok: false, planBlocked: false, error: `Apollo request failed: ${err?.message ?? "network error"}` };
  }

  const errResult = await handleApolloError(res);
  if (errResult) return errResult;

  const data: any = await res.json().catch(() => null);
  const p = data?.person;
  if (!p) return { ok: true, person: null };

  return { ok: true, person: extractPersonFromApolloData(p) };
}

/**
 * Search for a decision-maker at a company by name/domain using Apollo's
 * /mixed_people/search endpoint. Used when the prospect has only a placeholder
 * email (e.g. from Google Maps import) and we need to find the real contact.
 *
 * Tries each decision-maker title in order and returns the first match.
 */
async function searchDecisionMaker(apiKey: string, input: {
  companyName: string;
  website?: string | null;
  vertical?: string | null;
}): Promise<ApolloResult> {
  const vertical = input.vertical ?? "janitorial";
  const titles = DECISION_MAKER_TITLES[vertical] ?? DECISION_MAKER_TITLES["janitorial"];

  // Build the domain for organization lookup (Apollo prefers domain over name).
  let domain: string | undefined;
  if (input.website) {
    try {
      const withProto = input.website.startsWith("http") ? input.website : `https://${input.website}`;
      domain = new URL(withProto).hostname.replace(/^www\./, "");
    } catch { /* ignore */ }
  }

  const body: Record<string, unknown> = {
    page: 1,
    per_page: 5,
    person_titles: titles,
    // Apollo accepts either organization domain or name.
    ...(domain
      ? { organization_domains: [domain] }
      : { q_organization_name: input.companyName }),
  };

  let res: Response;
  try {
    res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    return { ok: false, planBlocked: false, error: `Apollo request failed: ${err?.message ?? "network error"}` };
  }

  const errResult = await handleApolloError(res);
  if (errResult) return errResult;

  const data: any = await res.json().catch(() => null);
  const people: any[] = data?.people ?? [];
  if (!people.length) return { ok: true, person: null };

  // Prefer the highest-priority title match.
  const lowerTitles = titles.map((t) => t.toLowerCase());
  const sorted = [...people].sort((a, b) => {
    const ia = lowerTitles.findIndex((t) => (a.title ?? "").toLowerCase().includes(t));
    const ib = lowerTitles.findIndex((t) => (b.title ?? "").toLowerCase().includes(t));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return { ok: true, person: extractPersonFromApolloData(sorted[0]) };
}

export async function enrichPerson(input: {
  email: string;
  contactName?: string | null;
  companyName?: string | null;
  website?: string | null;
  vertical?: string | null;
}): Promise<ApolloResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { ok: false, planBlocked: false, error: "APOLLO_API_KEY is not configured" };

  // For real emails: direct person match (returns title, LinkedIn, phone, etc.)
  if (!isPlaceholderEmail(input.email)) {
    return matchByEmail(apiKey, input);
  }

  // For placeholder emails (.invalid): find the decision-maker by company search.
  if (!input.companyName) {
    return { ok: true, person: null };
  }
  return searchDecisionMaker(apiKey, {
    companyName: input.companyName,
    website: input.website,
    vertical: input.vertical,
  });
}
