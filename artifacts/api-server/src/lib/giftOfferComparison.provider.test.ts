import { expect, it } from "vitest";
import {
  requestGiftOfferResearch,
  validateGiftOfferResearch,
} from "./giftOfferComparison";

it.skipIf(process.env.RUN_GIFT_OFFER_PROVIDER_CHECK !== "1")(
  "validates a synthetic generic gift against the configured web-search provider",
  async () => {
    const checkedAt = new Date().toISOString();
    const payload = await requestGiftOfferResearch("A5 hardcover desk notebook", checkedAt);
    const result = validateGiftOfferResearch(payload, "A5 hardcover desk notebook", checkedAt);
    expect(["offers_found", "no_verified_offers"]).toContain(result.status);
    expect(result.offers.every(offer =>
      offer.url.startsWith("https://")
      && offer.priceExcerpt.length > 0
      && offer.sourceCheckedAt === checkedAt)).toBe(true);
    console.info(JSON.stringify({
      validatedStatus: result.status,
      acceptedOfferCount: result.offers.length,
      rankingBasis: result.rankingBasis,
    }));
  },
  90_000,
);