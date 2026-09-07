import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { OpportunitySignal } from "@workspace/db";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2_500;
const MAX_RESPONSE_BYTES = 750_000;
const MAX_PAGES = 4;
const MAX_CONCURRENT_RESEARCH = 5;
const cache = new Map<string, { expiresAt: number; signals: OpportunitySignal[] }>();
const inFlight = new Map<string, Promise<OpportunitySignal[]>>();
let activeResearch = 0;
const waiters: Array<() => void> = [];

export interface ResearchLead {
  companyName: string;
  website?: string | null;
}

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
const stripHtml = (value: string) => normalizeText(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));

export function officialResearchCacheKey(lead: ResearchLead): string | undefined {
  if (!lead.website) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`);
    return `${url.hostname.toLowerCase().replace(/\.$/, "")}|${normalizeText(lead.companyName).toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function isBlockedIpv4(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 192 && (parts[1] === 0 || (parts[1] === 88 && parts[2] === 99)))
    || (parts[0] === 192 && parts[1] === 0 && parts[2] === 2)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100)))
    || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
}

function parseIpv6(address: string): number[] | undefined {
  let normalized = address.toLowerCase().split("%")[0];
  const dottedMatch = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedMatch) {
    const ipv4 = dottedMatch[1].split(".").map(Number);
    if (ipv4.length !== 4 || ipv4.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
    normalized = normalized.slice(0, -dottedMatch[1].length)
      + ((ipv4[0] << 8) | ipv4[1]).toString(16)
      + ":"
      + ((ipv4[2] << 8) | ipv4[3]).toString(16);
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return undefined;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map(group => Number.parseInt(group, 16));
  if (groups.length !== 8 || groups.some((group, index) => !/^[0-9a-f]{1,4}$/i.test([...left, ...Array(missing).fill("0"), ...right][index]) || !Number.isInteger(group))) {
    return undefined;
  }
  return groups;
}

export function isBlockedResearchAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return isBlockedIpv4(normalized.split(".").map(Number));
  const groups = parseIpv6(normalized);
  if (!groups) return true;

  // IPv4-compatible and IPv4-mapped IPv6 addresses encode the target in the
  // final 32 bits, including hexadecimal forms such as ::ffff:7f00:1.
  if (groups.slice(0, 5).every(group => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) {
    return isBlockedIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }

  // Only globally routable unicast space is eligible. Explicitly exclude
  // documentation, transition, benchmarking, and other reserved subranges.
  if (groups[0] < 0x2000 || groups[0] > 0x3fff) return true;
  if (groups[0] === 0x2001 && (
    groups[1] === 0
    || groups[1] === 0x0002
    || groups[1] === 0x0010
    || groups[1] === 0x0020
    || groups[1] === 0x0db8
  )) return true;
  if (groups[0] === 0x2002 || groups[0] === 0x3fff) return true;
  return false;
}

interface PinnedHost { address: string; family: 4 | 6 }
async function resolvePublicUrl(url: URL): Promise<PinnedHost> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new Error("Unsafe website URL");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("Private host blocked");
  const addresses: Array<{ address: string; family?: number }> = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out")), REQUEST_TIMEOUT_MS)),
      ]);
  if (!addresses.length || addresses.some(item => isBlockedResearchAddress(item.address))) throw new Error("Private host blocked");
  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) throw new Error("Unsupported address family");
  return { address: selected.address, family: selected.family };
}

async function pinnedRequest(url: URL, pinned: PinnedHost): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = transport(url, {
      method: "GET",
      headers: { "user-agent": "iSDRX-public-research/1.0", accept: "text/html,application/xhtml+xml" },
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, response => {
      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > MAX_RESPONSE_BYTES) { response.destroy(); reject(new Error("Response too large")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) response.destroy(new Error("Response too large"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("Website request timed out")));
    req.on("error", reject);
    req.end();
  });
}

const comparableHost = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

async function safeFetch(start: URL, officialHostname: string, allowAts = false): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const isAts = allowAts && isAllowedAts(url.hostname);
    if (comparableHost(url.hostname) !== comparableHost(officialHostname) && !isAts) throw new Error("Cross-origin request blocked");
    const response = await pinnedRequest(url, await resolvePublicUrl(url));
    if (response.status >= 300 && response.status < 400) {
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!location) throw new Error("Invalid redirect");
      url = new URL(location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Website returned ${response.status}`);
    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("Unsupported content type");
    return { url, html: response.body };
  }
  throw new Error("Too many redirects");
}

const ATS_HOSTS = ["greenhouse.io", "lever.co", "myworkdayjobs.com", "smartrecruiters.com", "applytojob.com"];
function isAllowedAts(hostname: string) {
  const host = hostname.toLowerCase();
  return ATS_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function linksFrom(html: string, base: URL): URL[] {
  const found: URL[] = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], base);
      if (
        url.origin === base.origin
        && /(?:career|jobs?|news|press|about|media|blog|insights?|resources?|updates?)/i.test(url.pathname)
        && !found.some(item => item.href === url.href)
      ) found.push(url);
    } catch { /* malformed public link */ }
  }
  return found
    .sort((left, right) => {
      const rank = (url: URL) =>
        /news|press|media|blog|updates?/i.test(url.pathname) ? 0
          : /career|jobs?/i.test(url.pathname) ? 1
            : 2;
      return rank(left) - rank(right);
    })
    .slice(0, MAX_PAGES - 1);
}

function atsLinksFrom(html: string, base: URL): URL[] {
  const found: URL[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      if (isAllowedAts(url.hostname) && !found.some(item => item.href === url.href)) found.push(url);
    } catch { /* malformed public link */ }
  }
  return found.slice(0, 2);
}

export interface JobListing {
  title: string;
  location?: string;
  id?: string;
  url?: string;
  date?: string;
  description?: string;
  confidence?: "high" | "medium";
}

export function deduplicateJobListings(listings: JobListing[]): JobListing[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const seenDescriptions = new Set<string>();
  return listings.filter(listing => {
    const id = listing.id?.toLowerCase();
    const url = listing.url?.toLowerCase();
    const descriptionKey = [listing.title, listing.location || "", listing.date || ""]
      .map(value => normalizeText(value).toLowerCase()).join("|");
    if (id ? (seenIds.has(id) || Boolean(url && seenUrls.has(url))) : (Boolean(url && seenUrls.has(url)) || seenDescriptions.has(descriptionKey))) return false;
    if (id) seenIds.add(id);
    if (url) seenUrls.add(url);
    seenDescriptions.add(descriptionKey);
    return true;
  });
}

function jsonLdJobs(html: string, page: URL): JobListing[] {
  const jobs: JobListing[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (!types.includes("JobPosting") || typeof item.title !== "string") continue;
        const postedAt = typeof item.datePosted === "string" ? Date.parse(item.datePosted) : NaN;
        const validThrough = typeof item.validThrough === "string" ? Date.parse(item.validThrough) : NaN;
        if (Number.isFinite(validThrough) && validThrough < Date.now()) continue;
        if (Number.isFinite(postedAt) && Date.now() - postedAt > 365 * 86_400_000 && !Number.isFinite(validThrough)) continue;
        const location = item.jobLocation?.address;
        jobs.push({
          title: normalizeText(item.title),
          location: normalizeText([location?.addressLocality, location?.addressRegion].filter(Boolean).join(", ")) || undefined,
          id: typeof item.identifier?.value === "string" ? item.identifier.value : undefined,
          url: typeof item.url === "string" ? new URL(item.url, page).toString() : page.toString(),
          date: typeof item.datePosted === "string" ? item.datePosted : undefined,
          description: typeof item.description === "string" ? stripHtml(item.description).slice(0, 500) : undefined,
          confidence: Number.isFinite(validThrough) || Number.isFinite(postedAt) ? "high" : "medium",
        });
      }
    } catch { /* invalid JSON-LD is not evidence */ }
  }
  return jobs;
}

function explicitOfficialJobs(html: string, page: URL): JobListing[] {
  const jobs: JobListing[] = [];
  const heading = html.match(/<h1\b[^>]*>([\s\S]{3,300}?)<\/h1>/i);
  const title = heading ? stripHtml(heading[1]) : "";
  if (title.length >= 4 && title.length <= 120 && /\bapply(?: now)?\b/i.test(stripHtml(html))
    && (isAllowedAts(page.hostname) || /(?:\/jobs?\/|\/positions?\/)/i.test(page.pathname))) {
    jobs.push({ title, url: page.toString(), description: `Live role page names "${title}" and includes an Apply action.`, confidence: "medium" });
  }
  return jobs;
}

function freshness(date?: string): OpportunitySignal["freshness"] {
  if (!date) return "unknown";
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return "unknown";
  const age = (Date.now() - timestamp) / 86_400_000;
  if (age < 0 || age > 365) return "stale";
  if (age <= 90) return "recent";
  if (age <= 180) return "active";
  return "older";
}

export function extractOfficialResearchSignals(companyName: string, pages: Array<{ url: URL; html: string }>, checkedAt: string): OpportunitySignal[] {
  const listings = deduplicateJobListings(pages.flatMap(page => [
    ...jsonLdJobs(page.html, page.url),
    ...explicitOfficialJobs(page.html, page.url),
  ]));
  const signals: OpportunitySignal[] = listings.map(job => ({
    signalType: "hiring_listing",
    signalTitle: `Official job listing: ${job.title}`,
    signalDescription: `${companyName} lists ${job.title}${job.location ? ` in ${job.location}` : ""} on its official website.`,
    signalClassification: "verified",
    confidenceLevel: job.confidence ?? "medium",
    freshness: freshness(job.date),
    sourceName: "Official company careers page",
    sourceURL: job.url,
    sourceDate: job.date,
    dateDiscovered: checkedAt,
    dateVerified: checkedAt,
    supportingEvidence: job.description?.slice(0, 300) || `Structured JobPosting data names the role ${job.title}.`,
    points: 0,
  }));
  if (!listings.length && pages.length) {
    signals.push({
      signalType: "hiring_research_status",
      signalTitle: "No active hiring signal found on inspected official pages",
      signalDescription: "No active job listing was found on the accessible official company pages inspected. This does not prove the company is not hiring.",
      signalClassification: "unconfirmed",
      confidenceLevel: "low",
      freshness: "unknown",
      sourceName: "Official company website",
      sourceURL: pages[0].url.toString(),
      dateDiscovered: checkedAt,
      dateVerified: checkedAt,
      supportingEvidence: "The accessible official website pages were checked, but no current structured or explicit job listing was found.",
      points: 0,
    });
  }
  for (const page of pages) {
    const text = stripHtml(page.html);
    const vehicle = text.match(/(?:company[- ]provided vehicle|company vehicle (?:is )?provided|take-home vehicle|company (?:van|truck) provided)/i);
    if (vehicle) signals.push({
      signalType: "fleet_vehicle_evidence", signalTitle: "Company vehicle evidence",
      signalDescription: `${companyName}'s official website states "${vehicle[0]}".`,
      signalClassification: "verified", confidenceLevel: "high", freshness: "unknown",
      sourceName: "Official company website", sourceURL: page.url.toString(), dateDiscovered: checkedAt, dateVerified: checkedAt,
      supportingEvidence: normalizeText(text.slice(Math.max(0, vehicle.index! - 120), vehicle.index! + vehicle[0].length + 120)), points: 0,
    });
    const eventPattern = /(?:acquired|acquisition of|rebrand(?:ed|ing)?|changed (?:its|our) name|new location|opened (?:a|our) new|expansion|expanded (?:into|to)|founded|newly (?:formed|established|launched)|(?:we|our company) launched)/i;
    const metadataDate = htmlDate(page.html);
    const securityIncidentPattern = /\b(?:data breach|cyber(?:security)? incident|security incident|ransomware|cyberattack|network intrusion|unauthorized access|data exposure)\b/i;
    const incidentActionPattern = /\b(?:experienced|suffered|discovered|identified|detected|investigat(?:ed|ing)|respond(?:ed|ing)|contained|notified|affected|impacted)\b/i;
    const incident = text.split(/(?<=[.!?])\s+/).find(sentence =>
      securityIncidentPattern.test(sentence)
      && incidentActionPattern.test(sentence)
      && (sentence.toLowerCase().includes(companyName.toLowerCase()) || /\b(?:we|our company|our organization)\b/i.test(sentence)),
    );
    if (incident) {
      const sentenceDate = incident.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i)?.[0]
        || incident.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
      const date = sentenceDate || metadataDate;
      if (date) {
        signals.push({
          signalType: "security_incident",
          signalTitle: "Official cybersecurity incident disclosure",
          signalDescription: normalizeText(incident).slice(0, 400),
          signalClassification: "verified",
          confidenceLevel: "high",
          freshness: freshness(date),
          sourceName: "Official company disclosure",
          sourceURL: page.url.toString(),
          sourceDate: date,
          dateDiscovered: checkedAt,
          dateVerified: checkedAt,
          supportingEvidence: normalizeText(incident).slice(0, 500),
          points: 0,
        });
      }
    }
    for (const event of text.split(/(?<=[.!?])\s+/).filter(sentence =>
      eventPattern.test(sentence) && (sentence.toLowerCase().includes(companyName.toLowerCase()) || /\b(?:we|our company)\b/i.test(sentence)),
    )) {
      const sentenceDate = event.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i)?.[0]
        || event.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
      const date = sentenceDate || (/\b(?:founded|formed|established)\b/i.test(event) ? undefined : metadataDate);
      if (!date) continue;
      signals.push({
      signalType: /acqui/i.test(event)
        ? "acquisition"
        : /rebrand|name/i.test(event)
          ? "rebrand"
          : /location|open/i.test(event)
            ? "new_location"
            : /founded|formed|established|launched/i.test(event)
              ? "company_launch"
              : "expansion",
      signalTitle: "Dated official company announcement", signalDescription: normalizeText(event).slice(0, 400),
      signalClassification: "verified", confidenceLevel: "high", freshness: freshness(date),
      sourceName: "Official company announcement", sourceURL: page.url.toString(), sourceDate: date,
      dateDiscovered: checkedAt, dateVerified: checkedAt, supportingEvidence: normalizeText(event).slice(0, 500), points: 0,
      });
    }
  }
  const seenNonHiringTypes = new Set<string>();
  return signals.filter(signal => {
    if (signal.signalType === "hiring_listing") return true;
    if (seenNonHiringTypes.has(signal.signalType)) return false;
    seenNonHiringTypes.add(signal.signalType);
    return true;
  });
}

function htmlDate(html: string): string | undefined {
  const metadata = html.match(/(?:article:published_time["'][^>]*content=["']|<time\b[^>]*datetime=["'])([^"']+)/i)?.[1]
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i)?.[1];
  if (metadata && Number.isFinite(Date.parse(metadata))) return metadata;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const entries = Array.isArray(data) ? data : [data, ...(data?.["@graph"] || [])];
      const date = entries.find(item => {
        const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        return types.some((type: unknown) => typeof type === "string" && /^(?:Article|NewsArticle|BlogPosting)$/i.test(type))
          && typeof item?.datePublished === "string";
      })?.datePublished;
      if (date && Number.isFinite(Date.parse(date))) return date;
    } catch { /* invalid structured metadata is not evidence */ }
  }
  return undefined;
}

async function withResearchSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeResearch >= MAX_CONCURRENT_RESEARCH) await new Promise<void>(resolve => waiters.push(resolve));
  activeResearch++;
  try { return await operation(); } finally {
    activeResearch--;
    waiters.shift()?.();
  }
}

export function getCachedOfficialResearch(lead: ResearchLead): OpportunitySignal[] | undefined {
  const key = officialResearchCacheKey(lead);
  if (!key) return undefined;
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.signals.map(signal => ({ ...signal }));
}

export async function researchOfficialWebsite(lead: ResearchLead): Promise<OpportunitySignal[]> {
  const key = officialResearchCacheKey(lead);
  if (!key) return [];
  const cached = getCachedOfficialResearch(lead);
  if (cached) return cached;
  const existingResearch = inFlight.get(key);
  if (existingResearch) return (await existingResearch).map(signal => ({ ...signal }));
  const research = withResearchSlot(async () => {
    const secondCheck = getCachedOfficialResearch(lead);
    if (secondCheck) return secondCheck;
    let signals: OpportunitySignal[] = [];
    try {
      const root = new URL(/^https?:\/\//i.test(lead.website!) ? lead.website! : `https://${lead.website}`);
      await resolvePublicUrl(root);
      const first = await safeFetch(root, root.hostname);
      const pages = [first];
      const linkedPages = await Promise.all(linksFrom(first.html, first.url).map(async link => {
        try { return await safeFetch(link, root.hostname); } catch { return null; }
      }));
      pages.push(...linkedPages.filter((page): page is { url: URL; html: string } => page !== null));
      const atsLinks = pages.flatMap(page => atsLinksFrom(page.html, page.url))
        .filter((link, index, all) => all.findIndex(candidate => candidate.href === link.href) === index)
        .slice(0, 2);
      const atsPages = await Promise.all(atsLinks.map(async link => {
        try { return await safeFetch(link, root.hostname, true); } catch { return null; }
       }));
       pages.push(...atsPages.filter((page): page is { url: URL; html: string } => page !== null));
       signals = extractOfficialResearchSignals(lead.companyName, pages, new Date().toISOString());
    } catch { /* all network/research failures degrade to UNKNOWN (no verified signal) */ }
    cache.set(key, { expiresAt: Date.now() + (signals.length ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS), signals });
    return signals.map(signal => ({ ...signal }));
  });
  inFlight.set(key, research);
  try {
    return (await research).map(signal => ({ ...signal }));
  } finally {
    inFlight.delete(key);
  }
}