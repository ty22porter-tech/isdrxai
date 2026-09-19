import { describe, expect, it } from "vitest";
import {
  rankVerifiedOffers,
  safeOfferUrl,
  validateGiftOfferResearch,
} from "./giftOfferComparison";
import type { GiftMerchantOffer } from "@workspace/db";

const offer = (overrides: Partial<GiftMerchantOffer> = {}): GiftMerchantOffer => ({
  itemName: "Comparable desk notebook",
  merchant: "Merchant",
  itemPriceUsd: 15,
  shippingKnown: false,
  shippingPriceUsd: null,
  availability: "available",
  url: "https://merchant.example/notebook",
  priceExcerpt: "Comparable desk notebook — $15.00",
  sourceCheckedAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

function payload(entries: any[], sources: string[]) {
  return {
    output_text: JSON.stringify({ offers: entries }),
    output: [{
      type: "web_search_call",
      status: "completed",
      action: { sources: sources.map(url => ({ url, title: "Product" })) },
    }],
  };
}

describe("gift offer evidence and ranking", () => {
  it("ranks the lowest known item plus shipping total ahead of unknown shipping", () => {
    const unknownCheap = offer({ itemPriceUsd: 10, merchant: "Unknown shipping" });
    const totalTwenty = offer({
      itemPriceUsd: 18, shippingKnown: true, shippingPriceUsd: 2,
      merchant: "Known total", url: "https://known.example/product",
    });
    const result = rankVerifiedOffers([unknownCheap, totalTwenty]);
    expect(result.rankingBasis).toBe("lowest_verified_total");
    expect(result.offers[0].merchant).toBe("Known total");
  });

  it("labels item-price ranking as delivery unconfirmed when all shipping is unknown", () => {
    const result = rankVerifiedOffers([
      offer({ itemPriceUsd: 20 }),
      offer({ itemPriceUsd: 12, url: "https://two.example/product" }),
    ]);
    expect(result.rankingBasis).toBe("lowest_listed_item_price_delivery_unconfirmed");
    expect(result.offers[0].itemPriceUsd).toBe(12);
  });

  it("returns no verified offers when research has no grounded results", () => {
    const result = validateGiftOfferResearch(payload([], []), "Desk notebook", "2025-01-01T00:00:00.000Z");
    expect(result).toMatchObject({ status: "no_verified_offers", rankingBasis: "none", offers: [] });
  });

  it("filters unsafe URLs, URLs outside the web-search allowlist, and ungrounded prices", () => {
    const result = validateGiftOfferResearch(payload([
      { ...offer(), url: "http://127.0.0.1/private" },
      { ...offer(), url: "https://invented.example/product" },
      { ...offer(), url: "https://merchant.example/notebook", itemPriceUsd: 99 },
    ], ["https://merchant.example/notebook"]), "Desk notebook", "2025-01-01T00:00:00.000Z");
    expect(result.offers).toEqual([]);
    expect(safeOfferUrl("https://192.168.1.3/x")).toBeNull();
    expect(safeOfferUrl("javascript:alert(1)")).toBeNull();
  });

  it("accepts an allowlisted source only when its excerpt contains the exact numeric price", () => {
    const raw = {
      itemName: "Comparable desk notebook",
      merchant: "Merchant",
      itemPriceUsd: 15,
      shippingKnown: false,
      shippingPriceUsd: null,
      availability: "available",
      url: "https://merchant.example/notebook",
      priceExcerpt: "Comparable desk notebook — $15.00",
    };
    const result = validateGiftOfferResearch(
      payload([raw], [raw.url]),
      "Desk notebook",
      "2025-01-01T00:00:00.000Z",
    );
    expect(result.offers).toHaveLength(1);
    expect(result.taxKnown).toBe(false);
  });

  it("does not accept a longer decimal as evidence for an integer item price", () => {
    const raw = {
      itemName: "Notebook",
      merchant: "Merchant",
      itemPriceUsd: 12,
      shippingKnown: false,
      shippingPriceUsd: null,
      availability: "available",
      url: "https://merchant.example/notebook",
      priceExcerpt: "Notebook $12.99",
    };
    expect(validateGiftOfferResearch(
      payload([raw], [raw.url]), "Notebook", "2025-01-01T00:00:00.000Z",
    ).offers).toEqual([]);
  });

  it("downgrades ungrounded or conditional shipping instead of treating it as zero", () => {
    const base = {
      itemName: "Notebook",
      merchant: "Merchant",
      itemPriceUsd: 12.99,
      shippingKnown: true,
      shippingPriceUsd: 0,
      availability: "available",
      url: "https://merchant.example/notebook",
      priceExcerpt: "Notebook $12.99",
    };
    const absent = validateGiftOfferResearch(
      payload([{ ...base, shippingEvidence: null }], [base.url]),
      "Notebook", "2025-01-01T00:00:00.000Z",
    ).offers[0];
    expect(absent).toMatchObject({ shippingKnown: false, shippingPriceUsd: null });

    const conditional = validateGiftOfferResearch(
      payload([{ ...base, shippingEvidence: "Free shipping for members" }], [base.url]),
      "Notebook", "2025-01-01T00:00:00.000Z",
    ).offers[0];
    expect(conditional).toMatchObject({ shippingKnown: false, shippingPriceUsd: null });
  });
});