import { isSalesBuyerContact } from "@workspace/db/ai-sales-automation";
import { logger } from "./logger";
import type { RecruitingJob } from "@workspace/db";
import { recruitingContactTargets, RECRUITING_FALLBACK_TITLES, type RecruitingContactMatch } from "./recruitingContactTargeting";

/**
 * Apollo.io people enrichment client.
 *
 * Requires APOLLO_API_KEY. Apollo can return 403 API_INACCESSIBLE when the key
 * lacks access to the requested endpoint. This can be caused by endpoint/key
 * scope or account-plan access, so the user-facing message must not diagnose a
 * specific plan without evidence.
 *
 * Enrichment strategy:
 *  1. If the prospect already has a real (non-placeholder) email, use
 *     /people/match to look them up directly and pull back name + contact info.
 *  2. If the email is a placeholder (prospects from Google Maps search),
 *     use /mixed_people/api_search to find a decision-maker at that
 *     company (facilities manager for janitorial, IT manager for IT, etc.)
 *     and return their name + email so outreach can actually reach someone.
 */

export interface ApolloEnrichment {
  contactMatch?: RecruitingContactMatch;
  /** Decision-maker's full name (filled when missing/placeholder). */
  contactName: string | null;
  /** Decision-maker's verified work email (filled when placeholder). */
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  phoneSource?: "person" | "company" | null;
  city: string | null;
  state: string | null;
  website: string | null;
  employeeCount: number | null;
  organizationDescription: string | null;
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
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return true;
  const domain = normalized.split("@")[1];
  // .invalid is reserved (RFC 2606); invalid.com and its subdomains are legacy sentinels.
  return normalized.endsWith(".invalid") || (!!domain && (domain === "invalid.com" || domain.endsWith(".invalid.com")));
}

function usableEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (isPlaceholderEmail(email)) return null;
  const [local, domain, extra] = email.split("@");
  if (extra !== undefined || !local || local.includes("..") || !domain) return null;
  if (!/^[^\s@]+$/.test(local) || !/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return null;
  return email;
}

/** Best-guess decision-maker titles by vertical, ordered by preference. */
export const DECISION_MAKER_TITLES: Record<string, string[]> = {
  ai_sales_automation: ["owner", "founder", "ceo", "chief executive officer", "chief revenue officer", "vp sales", "head of sales", "sales director", "sales manager", "business development director", "head of business development", "business development manager"],
  recruiting_staffing: [
    "director of talent acquisition", "head of talent acquisition", "human resources director",
    "hr manager", "chief human resources officer", "hiring manager", "operations manager",
    "plant manager", "warehouse manager", "procurement manager", "general manager", "owner", "founder", "ceo",
  ],
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

/** Generic corporate words that don't identify a specific company. */
const GENERIC_NAME_TOKENS = new Set([
  "inc", "llc", "ltd", "corp", "corporation", "co", "company", "group",
  "the", "and", "of", "for", "a", "an", "services", "service", "solutions",
  "enterprises", "holdings", "international", "usa", "us", "america",
]);

function significantNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !GENERIC_NAME_TOKENS.has(t));
}

function domainOf(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const withProto = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Reduce a hostname to its registrable domain (rough heuristic: last two labels,
 * three for common two-part public suffixes like co.uk). */
function registrableDomain(host: string | null): string | null {
  if (!host) return null;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return host;
  const twoPartSuffixes = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);
  const takeThree = twoPartSuffixes.has(labels[labels.length - 2]) && labels[labels.length - 1].length === 2;
  return labels.slice(takeThree ? -3 : -2).join(".");
}

/** Company name squashed to letters/digits only, for variant-tolerant comparison
 * ("McDonald's" vs "McDonalds", "Mockingbird Food" vs "MockingbirdFood"). */
function squashedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => !GENERIC_NAME_TOKENS.has(t))
    .join("");
}

/**
 * Sanity check: does the person Apollo returned actually belong to the company
 * we asked about? Apollo's name search is fuzzy and can return someone from an
 * unrelated company (e.g. a Swedish firm for a Dallas manufacturer). A wrong
 * contact is worse than no contact, so reject implausible matches.
 */
export function isPlausibleCompanyMatch(rawPerson: any, target: {
  companyName: string;
  domain?: string | null;
}): boolean {
  const org = rawPerson?.organization ?? {};
  const orgName: string = org.name ?? "";
  const orgDomain = domainOf(org.website_url) ?? (typeof org.primary_domain === "string" ? org.primary_domain.toLowerCase() : null);
  const emailDomain = typeof rawPerson?.email === "string" && rawPerson.email.includes("@")
    ? rawPerson.email.split("@")[1].toLowerCase()
    : null;

  const reject = (reason: string) => {
    logger.warn(
      { reason },
      "Apollo match rejected as implausible",
    );
    return false;
  };

  if (target.domain) {
    const t = registrableDomain(target.domain.toLowerCase());
    // Explicit conflict: Apollo names a *different* company domain. A name
    // resemblance can't rescue this — "Acme Dental" is not "Acme Manufacturing".
    if (orgDomain && registrableDomain(orgDomain) !== t) return reject("org domain conflicts with company website");
    if (registrableDomain(orgDomain) === t || registrableDomain(emailDomain) === t) return true;
  }

  // Name evidence (used when there is no reliable conflicting domain):
  // distinctive token overlap, or squashed-name containment for punctuation/
  // concatenation variants ("McDonald's" ⊂ "McDonalds Corporation").
  const targetTokens = significantNameTokens(target.companyName);
  const orgTokens = new Set(significantNameTokens(orgName));
  if (targetTokens.some((t) => orgTokens.has(t))) return true;

  const sq1 = squashedName(target.companyName);
  const sq2 = squashedName(orgName);
  if (sq1.length >= 4 && sq2.length >= 4 && (sq1.includes(sq2) || sq2.includes(sq1))) return true;

  return reject("no domain or name evidence linking person to company");
}

export function extractPersonFromApolloData(p: any): ApolloEnrichment {
  const org = p.organization ?? {};

  // Build full name from whichever fields Apollo returns.
  const fullName =
    p.name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    null;

  // Apollo may return the work email in different locations.
  const workEmail = usableEmail(p.email) ??
    (Array.isArray(p.contact?.email_addresses)
      ? p.contact.email_addresses.map((address: any) => usableEmail(address?.email)).find(Boolean) ?? null
      : null);

  // People enrichment can return direct numbers in phone_numbers rather
  // than sanitized_phone. Prefer a person's number to the company switchboard.
  const phoneNumbers = (value: unknown): unknown[] => Array.isArray(value)
    ? value.flatMap(number => [number?.sanitized_number, number?.raw_number])
    : [];
  const personPhones = [
    p.contact?.sanitized_phone,
    p.sanitized_phone,
    ...phoneNumbers(p.contact?.phone_numbers),
    ...phoneNumbers(p.phone_numbers),
  ];
  const companyPhones = [
    org.sanitized_phone,
    org.primary_phone?.sanitized_number,
    org.primary_phone?.number,
    org.phone,
  ];
  const firstPhone = (values: unknown[]) => values.find((value): value is string =>
    typeof value === "string" && Boolean(value.trim()))?.trim() ?? null;
  const personPhone = firstPhone(personPhones);
  const companyPhone = firstPhone(companyPhones);
  const phone = personPhone ?? companyPhone;
  const organizationDescription = [org.short_description, org.seo_description, org.description]
    .find((value) => typeof value === "string" && value.trim().length >= 30)
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) ?? null;

  return {
    contactName: fullName,
    email: workEmail,
    title: p.title ?? null,
    linkedinUrl: sanitizeLinkedinUrl(p.linkedin_url),
    phone,
    phoneSource: personPhone ? "person" : companyPhone ? "company" : null,
    city: p.city ?? org.city ?? null,
    state: p.state ?? org.state ?? null,
    website: org.website_url ?? null,
    employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    organizationDescription,
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
        ? "Apollo denied access to this enrichment endpoint (API_INACCESSIBLE). Check the API key's endpoint permissions and account API access; the required access may depend on the Apollo plan."
        : "Apollo denied this enrichment request (403). Check the API key and its endpoint permissions.",
    };
  }
  if (res.status === 429) {
    return { ok: false, planBlocked: false, error: "Apollo rate limit reached — try again in a minute." };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    logger.warn({ status: res.status }, "Apollo enrichment unexpected response");
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
    const timedOut = err?.name === "AbortError" || err?.name === "TimeoutError";
    return { ok: false, planBlocked: false, error: timedOut ? "Apollo contact lookup timed out. Try again." : "Apollo contact lookup could not be reached. Try again." };
  }

  const errResult = await handleApolloError(res);
  if (errResult) return errResult;

  const data: any = await res.json().catch(() => null);
  const p = data?.person;
  if (!p) return { ok: true, person: null };

  // The caller already has a usable email. Apollo may know additional contact
  // fields without returning the address again.
  return { ok: true, person: extractPersonFromApolloData(p) };
}

/**
 * Search for a decision-maker at a company by name/domain using Apollo's
 * /mixed_people/api_search endpoint. Used when the prospect has only a placeholder
 * email (e.g. from Google Maps import) and we need to find the real contact.
 *
 * Tries preferred titles first, then a broader search if none reveal an email.
 */
async function searchDecisionMaker(apiKey: string, input: {
  companyName: string;
  website?: string | null;
  vertical?: string | null;
  recruitingJobs?: readonly RecruitingJob[];
}): Promise<ApolloResult> {
  const vertical = input.vertical ?? "janitorial";
  const recruiting = vertical === "recruiting_staffing"
    ? recruitingContactTargets(input.recruitingJobs ?? []) : undefined;
  // Never spend recruiting contact credits without verified active jobs.
  if (recruiting && !recruiting.hasActiveJobs) return { ok: true, person: null };
  const titles = recruiting?.titles ?? DECISION_MAKER_TITLES[vertical] ?? DECISION_MAKER_TITLES["janitorial"];

  // Build the domain for organization lookup (Apollo prefers domain over name).
  let domain: string | undefined;
  if (input.website) {
    try {
      const withProto = input.website.startsWith("http") ? input.website : `https://${input.website}`;
      domain = new URL(withProto).hostname.replace(/^www\./, "");
    } catch { /* ignore */ }
  }

  // NOTE: api_search silently ignores unknown filters (e.g. "organization_domains"),
  // returning people from random companies — the correct param is
  // q_organization_domains_list. Verified against the live API.
  const companyFilter = domain
    ? { q_organization_domains_list: [domain] }
    : { q_organization_name: input.companyName };

  const runSearch = async (withTitles: boolean): Promise<{ people: any[] } | ApolloResult> => {
    let res: Response;
    try {
      res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ page: 1, per_page: 5,
          ...(recruiting ? { person_titles: withTitles ? titles : RECRUITING_FALLBACK_TITLES }
            : withTitles ? { person_titles: titles } : {}), ...companyFilter }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: any) {
      const timedOut = err?.name === "AbortError" || err?.name === "TimeoutError";
      return { ok: false, planBlocked: false, error: timedOut ? "Apollo contact lookup timed out. Try again." : "Apollo contact lookup could not be reached. Try again." };
    }
    const errResult = await handleApolloError(res);
    if (errResult) return errResult;
    const data: any = await res.json().catch(() => null);
    return { people: data?.people ?? [] };
  };

  // Favor candidates Apollo says have an email; retain preferred-title order
  // within each group. The search results themselves do not reveal emails.
  const lowerTitles = titles.map((t) => t.toLowerCase());
  const sortCandidates = (people: any[]) => [...people].sort((a, b) => {
    if (recruiting && recruiting.locationMatch(a.city) !== recruiting.locationMatch(b.city)) {
      return recruiting.locationMatch(a.city) ? -1 : 1;
    }
    if (Boolean(a.has_email) !== Boolean(b.has_email)) return a.has_email ? -1 : 1;
    const ia = lowerTitles.findIndex((t) => (a.title ?? "").toLowerCase().includes(t));
    const ib = lowerTitles.findIndex((t) => (b.title ?? "").toLowerCase().includes(t));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const target = { companyName: input.companyName, domain };
  const attemptedIds = new Set<string>();
  // At most three reveals for preferred titles and five total across both
  // searches. Never pay to reveal the same person twice.
  for (const withTitles of (vertical === "ai_sales_automation" ? [true] : [true, false])) {
    if (recruiting && withTitles && !titles.length) continue;
    const search = await runSearch(withTitles);
    if ("ok" in search) return search;
    const limit = withTitles ? 3 : 5;
    for (const chosen of sortCandidates(search.people)) {
      if (attemptedIds.size >= limit) break;
      if (!chosen?.id || attemptedIds.has(String(chosen.id))) continue;
      if (vertical === "ai_sales_automation" && !isSalesBuyerContact(chosen.title)) continue;
      if (recruiting && !recruiting.classify(chosen.title ?? "", !withTitles)) continue;
      // Apollo's fuzzy search can return unrelated companies. Check both the
      // obfuscated search result and the revealed person before accepting it.
      if (!isPlausibleCompanyMatch(chosen, target)) continue;
      attemptedIds.add(String(chosen.id));
      let matchRes: Response;
      try {
        matchRes = await fetch("https://api.apollo.io/api/v1/people/match", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify({ id: chosen.id, reveal_personal_emails: false }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err: any) {
        const timedOut = err?.name === "AbortError" || err?.name === "TimeoutError";
        return { ok: false, planBlocked: false, error: timedOut ? "Apollo contact lookup timed out. Try again." : "Apollo contact lookup could not be reached. Try again." };
      }

      const matchErr = await handleApolloError(matchRes);
      if (matchErr) return matchErr;

      const matchData: any = await matchRes.json().catch(() => null);
      const person = matchData?.person;
      if (!person) continue;

      if (!isPlausibleCompanyMatch(person, target)) continue;
      const enriched = extractPersonFromApolloData(person);
      if (recruiting) {
        const department = recruiting.classify(enriched.title ?? "", !withTitles);
        if (!department) continue;
        enriched.contactMatch = recruiting.describe(department, !withTitles, person.city);
        const employerName = typeof person.organization?.name === "string"
          ? person.organization.name.trim() : "Name not provided";
        const matchedDomain = domain && (registrableDomain(domainOf(person.organization?.website_url)
          ?? domainOf(person.organization?.primary_domain)) === registrableDomain(domain)
          || registrableDomain(domainOf(enriched.email?.split("@")[1])) === registrableDomain(domain));
        enriched.contactMatch.reason += ` Apollo employer: ${employerName}. ${matchedDomain
          ? `Matched supplied employer domain: ${domain}.`
          : "Matched by company name; employer website association is unconfirmed."}`;
        if (enriched.phone) enriched.contactMatch.reason += enriched.phoneSource === "company"
          ? " Phone source: Apollo company record; this is not a confirmed direct line."
          : " Phone source: Apollo person record; direct-line ownership is unconfirmed.";
      }
      if (enriched.email) return { ok: true, person: enriched };
    }
  }

  return { ok: true, person: null };
}

export async function enrichPerson(input: {
  email: string;
  contactName?: string | null;
  companyName?: string | null;
  website?: string | null;
  vertical?: string | null;
  recruitingJobs?: readonly RecruitingJob[];
}): Promise<ApolloResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { ok: false, planBlocked: false, error: "APOLLO_API_KEY is not configured" };

  // For real emails: direct person match (returns title, LinkedIn, phone, etc.)
  const email = input.email.trim().toLowerCase();
  if (!isPlaceholderEmail(email)) {
    return matchByEmail(apiKey, { ...input, email });
  }

  // For placeholder emails (.invalid): find the decision-maker by company search.
  if (!input.companyName) {
    return { ok: true, person: null };
  }
  return searchDecisionMaker(apiKey, {
    companyName: input.companyName,
    website: input.website,
    vertical: input.vertical,
    recruitingJobs: input.recruitingJobs,
  });
}
