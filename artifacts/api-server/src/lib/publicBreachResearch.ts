import { request as httpsRequest } from "node:https";
import type { OpportunitySignal } from "@workspace/db";

const HHS_BREACH_REPORT_URL = "https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_RESPONSE_BYTES = 300_000;

interface PublicBreachLead {
  companyName: string;
  industry: string;
  state: string;
}

export interface HhsBreachRecord {
  organizationName: string;
  state: string;
  coveredEntityType: string;
  individualsAffected: string;
  submissionDate: string;
  breachType: string;
  informationLocation: string;
}

let cache: { expiresAt: number; records: HhsBreachRecord[] } | undefined;
let inFlight: Promise<HhsBreachRecord[]> | undefined;

function decodeHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedOrganizationName(value: string): string {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseHhsBreachRecords(html: string): HhsBreachRecord[] {
  const records: HhsBreachRecord[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*\bdata-ri=["'][^"']+["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => decodeHtml(match[1]));
    if (cells.length < 8 || !cells[1] || !cells[2] || !cells[5]) continue;
    records.push({
      organizationName: cells[1],
      state: cells[2].toUpperCase(),
      coveredEntityType: cells[3],
      individualsAffected: cells[4],
      submissionDate: cells[5],
      breachType: cells[6],
      informationLocation: cells[7],
    });
  }
  return records;
}

export function findExactHhsBreachRecord(
  records: HhsBreachRecord[],
  companyName: string,
  state: string,
): HhsBreachRecord | undefined {
  const normalizedName = normalizedOrganizationName(companyName);
  const normalizedState = state.trim().toUpperCase();
  return records.find(item =>
    normalizedOrganizationName(item.organizationName) === normalizedName
    && item.state === normalizedState,
  );
}

function freshness(date: string): OpportunitySignal["freshness"] {
  const age = Date.now() - Date.parse(date);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  const days = age / 86_400_000;
  return days <= 90 ? "recent" : days <= 365 ? "active" : days <= 730 ? "older" : "stale";
}

async function fetchHhsRecords(): Promise<HhsBreachRecord[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.records;
  if (inFlight) return inFlight;
  inFlight = new Promise((resolve, reject) => {
    const req = httpsRequest(HHS_BREACH_REPORT_URL, {
      method: "GET",
      headers: {
        "user-agent": "iSDRX-public-research/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    }, response => {
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
        response.resume();
        reject(new Error(`HHS breach portal returned ${response.statusCode || 0}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) response.destroy(new Error("HHS breach portal response too large"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(parseHhsBreachRecords(Buffer.concat(chunks).toString("utf8"))));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("HHS breach portal request timed out")));
    req.on("error", reject);
    req.end();
  });
  try {
    const records = await inFlight;
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, records };
    return records;
  } finally {
    inFlight = undefined;
  }
}

export async function researchPublicBreachRecords(lead: PublicBreachLead): Promise<OpportunitySignal[]> {
  if (!/health|medical|dental|clinic|hospital/i.test(lead.industry)) return [];
  try {
    const records = await fetchHhsRecords();
    const record = findExactHhsBreachRecord(records, lead.companyName, lead.state);
    if (!record) return [];
    const checkedAt = new Date().toISOString();
    return [{
      signalType: "security_incident",
      signalTitle: "HHS OCR breach report match",
      signalDescription: `The HHS OCR public portal lists a breach report submitted for ${record.organizationName} in ${record.state} on ${record.submissionDate}.`,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: freshness(record.submissionDate),
      sourceName: "HHS OCR Breach Portal",
      sourceURL: HHS_BREACH_REPORT_URL,
      sourceDate: record.submissionDate,
      dateDiscovered: checkedAt,
      dateVerified: checkedAt,
      supportingEvidence: [
        `Covered entity type: ${record.coveredEntityType}`,
        `Individuals affected: ${record.individualsAffected}`,
        `Reported breach type: ${record.breachType}`,
        `Location: ${record.informationLocation}`,
      ].join("; "),
      points: 0,
    }];
  } catch {
    return [];
  }
}