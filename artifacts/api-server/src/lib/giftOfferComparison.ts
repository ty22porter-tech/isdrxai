import { researchModelSettings } from "./aiModelSettings";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  db,
  prospectsTable,
  type GiftMerchantOffer,
  type GiftOfferComparison,
} from "@workspace/db";
import { GiftOutreachError } from "./giftOutreach";

const CACHE_MS = 5 * 60_000;
const rawOfferSchema = z.object({
  itemName: z.string().trim().min(1).max(200),
  merchant: z.string().trim().min(1).max(120),
  itemPriceUsd: z.number().positive().max(100000),
  shippingKnown: z.boolean(),
  shippingPriceUsd: z.number().min(0).max(10000).nullable(),
  shippingEvidence: z.string().trim().max(500).nullable().optional(),
  availability: z.enum(["available", "unavailable", "unknown"]),
  url: z.string(),
  priceExcerpt: z.string().trim().min(1).max(500),
}).strict();
const rawResultSchema = z.object({ offers: z.array(rawOfferSchema).max(12) }).strict();

export function safeOfferUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
      || host === "::1") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function outputJson(payload: any): unknown {
  const text = payload?.output_text
    || payload?.output?.flatMap((item: any) => item?.content ?? [])
      .find((item: any) => item?.type === "output_text")?.text;
  if (typeof text !== "string") return null;
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
}

function sourceAllowlist(payload: any): Set<string> {
  const urls = payload?.output
    ?.filter((item: any) => item?.type === "web_search_call" && item?.status === "completed")
    .flatMap((item: any) => item?.action?.sources ?? [])
    .map((source: any) => safeOfferUrl(source?.url))
    .filter(Boolean) ?? [];
  return new Set(urls);
}

function centsInExcerpt(excerpt: string, price: number): boolean {
  const escaped = price.toFixed(2).replace(".", "\\.");
  const flexible = Number.isInteger(price) ? `${price}(?:\\.00)?` : escaped;
  return new RegExp(`(?:\\$|USD\\s*)${flexible}(?![\\d.])`, "i").test(excerpt);
}

function groundedShipping(raw: z.infer<typeof rawOfferSchema>): Pick<GiftMerchantOffer, "shippingKnown" | "shippingPriceUsd"> {
  if (!raw.shippingKnown || raw.shippingPriceUsd == null || !raw.shippingEvidence) {
    return { shippingKnown: false, shippingPriceUsd: null };
  }
  const evidence = raw.shippingEvidence;
  // Conditional shipping is not the cost of this offer unless checkout has
  // already established that this specific item/order qualifies.
  if (/\b(?:members?|membership|with\s+\$?\d+|orders?\s+(?:over|above)|minimum|select\s+(?:items|orders)|eligible\s+(?:items|orders)|subscription)\b/i.test(evidence)) {
    return { shippingKnown: false, shippingPriceUsd: null };
  }
  const grounded = raw.shippingPriceUsd === 0
    ? /\b(?:free shipping|shipping\s*[:\-]\s*\$?0(?:\.00)?|delivery\s*[:\-]\s*\$?0(?:\.00)?)\b/i.test(evidence)
    : centsInExcerpt(evidence, raw.shippingPriceUsd);
  return grounded
    ? { shippingKnown: true, shippingPriceUsd: raw.shippingPriceUsd }
    : { shippingKnown: false, shippingPriceUsd: null };
}

export function rankVerifiedOffers(offers: GiftMerchantOffer[]): {
  offers: GiftMerchantOffer[];
  rankingBasis: GiftOfferComparison["rankingBasis"];
} {
  const available = offers.filter(offer => offer.availability === "available");
  const knownTotals = available.filter(offer => offer.shippingKnown && offer.shippingPriceUsd != null);
  if (knownTotals.length) {
    const ranked = [...offers].sort((a, b) => {
      const aTotal = a.availability === "available" && a.shippingKnown && a.shippingPriceUsd != null
        ? a.itemPriceUsd + a.shippingPriceUsd : Infinity;
      const bTotal = b.availability === "available" && b.shippingKnown && b.shippingPriceUsd != null
        ? b.itemPriceUsd + b.shippingPriceUsd : Infinity;
      return aTotal - bTotal;
    });
    return { offers: ranked, rankingBasis: "lowest_verified_total" };
  }
  if (available.length) {
    return {
      offers: [...offers].sort((a, b) =>
        (a.availability === "available" ? a.itemPriceUsd : Infinity)
        - (b.availability === "available" ? b.itemPriceUsd : Infinity)),
      rankingBasis: "lowest_listed_item_price_delivery_unconfirmed",
    };
  }
  return { offers, rankingBasis: "none" };
}

export function validateGiftOfferResearch(payload: any, giftName: string, checkedAt: string): GiftOfferComparison {
  const parsed = rawResultSchema.safeParse(outputJson(payload));
  const allowed = sourceAllowlist(payload);
  const offers: GiftMerchantOffer[] = parsed.success ? parsed.data.offers.flatMap(raw => {
    const url = safeOfferUrl(raw.url);
    if (!url || !allowed.has(url) || !centsInExcerpt(raw.priceExcerpt, raw.itemPriceUsd)) return [];
    const { shippingEvidence: _shippingEvidence, ...publicRaw } = raw;
    return [{
      ...publicRaw,
      ...groundedShipping(raw),
      url,
      sourceCheckedAt: checkedAt,
    }];
  }) : [];
  const unique = [...new Map(offers.map(offer => [offer.url, offer])).values()].slice(0, 8);
  const ranked = rankVerifiedOffers(unique);
  return {
    giftName,
    ideaSignature: "",
    checkedAt,
    status: unique.length ? "offers_found" : "no_verified_offers",
    rankingBasis: ranked.rankingBasis,
    taxKnown: false,
    offers: ranked.offers,
  };
}

type Researcher = (giftName: string, checkedAt: string) => Promise<any>;

export async function requestGiftOfferResearch(giftName: string, checkedAt: string): Promise<any> {
  const base = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!base || !key) throw new GiftOutreachError("Live price comparison is not configured.", 502);
  const response = await fetch(`${base}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      ...researchModelSettings(3500),
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
      include: ["web_search_call.action.sources"],
      input: `Today is ${checkedAt.slice(0, 10)}. Compare current purchasable listings for the saved gift idea ${JSON.stringify(giftName)}. Search broadly and impartially across merchants. If the name identifies a college or university, include its official store and Rally House when they have a comparable listing, but do not favor them.

Only include listings for materially comparable products that match the gift identity. Every offer URL must be a direct HTTPS product page returned by web search. Never invent a price, merchant, URL, shipping, or availability. Copy a short exact source excerpt containing the listed USD item price. Shipping is known only when the source explicitly states its unconditional numeric cost for this item, including explicit $0/free shipping; minimum-order, membership, subscription, or other conditional shipping is unknown. When known, copy a separate exact shippingEvidence excerpt; otherwise shippingKnown=false, shippingPriceUsd=null, shippingEvidence=null. Mark available only when the source indicates it can currently be purchased. Taxes are not part of this research.

Return JSON only: {"offers":[{"itemName":"exact listing identity","merchant":"merchant name","itemPriceUsd":12.99,"shippingKnown":false,"shippingPriceUsd":null,"shippingEvidence":null,"availability":"available|unavailable|unknown","url":"https://direct-product-page","priceExcerpt":"exact source text containing $12.99"}]}. Return {"offers":[]} when reliable priced product pages are unavailable.`,
    }),
  });
  if (!response.ok) throw new GiftOutreachError("Live price comparison is temporarily unavailable. Please retry.", 502);
  return response.json();
}

function signature(name: string, budget: number, generatedAt: string): string {
  return createHash("sha256").update(`${name}\0${budget}\0${generatedAt}`).digest("hex").slice(0, 24);
}

export async function compareGiftSuggestionOffers(
  clientId: string,
  prospectId: number,
  ideaIndex: number,
  researcher: Researcher = requestGiftOfferResearch,
): Promise<GiftOfferComparison> {
  const [prospect] = await db.select({ giftSuggestions: prospectsTable.giftSuggestions })
    .from(prospectsTable).where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.clientId, clientId)));
  const suggestions = prospect?.giftSuggestions;
  const idea = suggestions?.ideas[ideaIndex];
  if (!prospect || !suggestions || !idea) throw new GiftOutreachError("Saved gift idea not found", 404);
  const ideaSignature = signature(idea.name, suggestions.budgetUsd, suggestions.generatedAt);
  const cached = idea.offerComparison;
  if (cached?.ideaSignature === ideaSignature && Date.now() - Date.parse(cached.checkedAt) < CACHE_MS) return cached;

  const checkedAt = new Date().toISOString();
  let payload: any;
  try { payload = await researcher(idea.name, checkedAt); }
  catch (error) {
    if (error instanceof GiftOutreachError) throw error;
    throw new GiftOutreachError("Live price comparison is temporarily unavailable. Please retry.", 502);
  }
  const comparison = { ...validateGiftOfferResearch(payload, idea.name, checkedAt), ideaSignature };
  const [updated] = await db.update(prospectsTable).set({
    // Change only this idea's comparison. This preserves comparisons written
    // concurrently for other ideas instead of replacing the whole JSON value.
    giftSuggestions: sql`jsonb_set(
      ${prospectsTable.giftSuggestions},
      ARRAY['ideas', ${String(ideaIndex)}, 'offerComparison']::text[],
      ${JSON.stringify(comparison)}::jsonb,
      true
    )`,
  })
    .where(and(
      eq(prospectsTable.id, prospectId),
      eq(prospectsTable.clientId, clientId),
      sql`${prospectsTable.giftSuggestions}->>'generatedAt' = ${suggestions.generatedAt}`,
      sql`${prospectsTable.giftSuggestions}->>'budgetUsd' = ${String(suggestions.budgetUsd)}`,
      sql`${prospectsTable.giftSuggestions}->'ideas'->${ideaIndex}->>'name' = ${idea.name}`,
    ))
    .returning({ id: prospectsTable.id });
  if (!updated) {
    throw new GiftOutreachError("Gift ideas changed while prices were being checked. Refresh and compare again.", 409);
  }
  return comparison;
}
