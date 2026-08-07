import { logger } from "./logger";

/**
 * Apollo.io people enrichment client.
 *
 * Requires APOLLO_API_KEY. Apollo blocks ALL API access on the Free plan —
 * calls return 403 API_INACCESSIBLE until the account is on any paid plan.
 * We surface that as { planBlocked: true } so the UI can explain it nicely.
 */

export interface ApolloEnrichment {
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

export async function enrichPerson(input: {
  email: string;
  contactName?: string | null;
  companyName?: string | null;
}): Promise<ApolloResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { ok: false, planBlocked: false, error: "APOLLO_API_KEY is not configured" };

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

  const data: any = await res.json().catch(() => null);
  const p = data?.person;
  if (!p) return { ok: true, person: null };

  const org = p.organization ?? {};
  const phone =
    p.contact?.sanitized_phone ||
    p.sanitized_phone ||
    org.sanitized_phone ||
    org.phone ||
    null;

  return {
    ok: true,
    person: {
      title: p.title ?? null,
      linkedinUrl: sanitizeLinkedinUrl(p.linkedin_url),
      phone,
      city: p.city ?? org.city ?? null,
      state: p.state ?? org.state ?? null,
      website: org.website_url ?? null,
      employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    },
  };
}
