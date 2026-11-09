import { describe, expect, it, vi } from "vitest";
import { foundingDiscount, isCurrentPlanPrice } from "./planPricing";

import { basePrice, coupon, promotion } from "./planPricing.fixtures";

describe("authoritative new-subscription pricing", () => {
  it.each([
    [49900, "iSDRX AI", true], [74900, "iSDRX AI Growth", true],
    [24900, "iSDRX AI Starter", false], [24900, "iSDRX AI", false],
    [79900, "iSDRX AI Growth", false], [49900, "iSDRX AI Growth", false],
  ])("permits only current USD monthly prices: %s %s", (amount, name, allowed) => {
    expect(isCurrentPlanPrice({ ...basePrice, unit_amount: amount, product: { ...basePrice.product, name } })).toBe(allowed);
  });
  it("rejects disabled, annual, multi-month, and non-USD prices", () => {
    for (const patch of [{ active: false }, { currency: "eur" }, { recurring: { interval: "year", interval_count: 1 } }, { recurring: { interval: "month", interval_count: 3 } }]) {
      expect(isCurrentPlanPrice({ ...basePrice, ...patch })).toBe(false);
    }
  });
});

describe("Founding20 verification", () => {
  const client = (value = promotion) => ({ promotionCodes: { list: vi.fn().mockResolvedValue({ data: [value] }) } }) as any;
  it("does not grant a discount when no code is provided", async () => {
    const stripe = client();
    expect(await foundingDiscount(stripe, undefined, basePrice)).toBeNull();
    expect(stripe.promotionCodes.list).not.toHaveBeenCalled();
  });
  it("accepts the 20th available native redemption using case-insensitive code entry", async () => {
    expect(await foundingDiscount(client(), "  founding20  ", basePrice)).toEqual({ promotionId: "promo_founding", code: "Founding20" });
  });
  it.each(["not-a-code", 249, { waiveOnboarding: true }])("rejects invalid input instead of falling back to full-price checkout", async input => {
    await expect(foundingDiscount(client(), input, basePrice)).rejects.toThrow("Invalid promotional code");
  });
  it.each([
    { times_redeemed: 20 }, { active: false }, { max_redemptions: 21 },
    { expires_at: 1 }, { customer: "cus_elsewhere" },
    { restrictions: { first_time_transaction: false } },
  ])("rejects exhausted or incorrectly restricted promotions: %j", async patch => {
    await expect(foundingDiscount(client({ ...promotion, ...patch }), "Founding20", basePrice)).rejects.toThrow();
  });
  it.each([
    { duration: "once" }, { amount_off: 24950 }, { max_redemptions: null }, { currency: "eur" },
    { applies_to: { products: ["prod_base", "prod_growth"] } }, { valid: false },
  ])("rejects coupons whose actual billing terms differ: %j", async patch => {
    await expect(foundingDiscount(client({ ...promotion, promotion: { coupon: { ...coupon, ...patch } } }), "Founding20", basePrice)).rejects.toThrow();
  });
  it("does not apply the promotion to Growth", async () => {
    await expect(foundingDiscount(client(), "Founding20", { ...basePrice, product: { ...basePrice.product, name: "iSDRX AI Growth" } })).rejects.toThrow("only to the $499");
  });
});
