import { describe, expect, it, vi } from "vitest";
vi.mock("./stripeClient", () => ({ getUncachableStripeClient: vi.fn() }));
import { configurePricing } from "./configure-pricing";
import { coupon, promotion } from "./lib/planPricing.fixtures";

function client(overrides: any = {}) {
  return {
    balance: { retrieve: vi.fn().mockResolvedValue({ livemode: true }) },
    products: {
      search: vi.fn().mockImplementation(({ query }) => Promise.resolve({ data: [{ id: query.includes("Launch") ? "prod_launch" : query.includes("Growth") ? "prod_growth" : "prod_base", name: query.includes("Launch") ? "AI Sales Launch Package" : query.includes("Growth") ? "iSDRX AI Growth" : "iSDRX AI" }] })),
      create: vi.fn(), update: vi.fn().mockResolvedValue({}),
    },
    prices: { list: vi.fn().mockImplementation(({ product }) => Promise.resolve({ data: [{ id: `price_${product}`, currency: "usd", unit_amount: product === "prod_launch" ? 99500 : product === "prod_base" ? 49900 : 74900, recurring: product === "prod_launch" ? null : { interval: "month", interval_count: 1 } }] })), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    promotionCodes: { list: vi.fn().mockResolvedValue({ data: [promotion] }), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    coupons: { retrieve: vi.fn().mockResolvedValue(coupon), create: vi.fn().mockResolvedValue(coupon) },
    ...overrides,
  } as any;
}

describe("Stripe pricing catalog configuration", () => {
  it("dry run performs no writes", async () => {
    const stripe = client();
    await configurePricing(stripe, false, "live", vi.fn());
    expect(stripe.products.update).not.toHaveBeenCalled();
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
  });
  it("refuses a mode mismatch before modifying anything", async () => {
    const stripe = client();
    await expect(configurePricing(stripe, true, "test", vi.fn())).rejects.toThrow("mode mismatch");
    expect(stripe.products.search).not.toHaveBeenCalled();
  });
  it("reapplying does not create products, prices, or reset redemption history", async () => {
    const stripe = client();
    await configurePricing(stripe, true, "live", vi.fn());
    await configurePricing(stripe, true, "live", vi.fn());
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(stripe.products.update).toHaveBeenCalledWith("prod_growth", expect.objectContaining({ metadata: expect.objectContaining({ monthly_email_capacity: "3000", included_users: "3" }) }));
  });
  it("does not reactivate or replace an exhausted promotion", async () => {
    const stripe = client();
    stripe.promotionCodes.list.mockResolvedValue({ data: [{ ...promotion, active: false, times_redeemed: 20, promotion: { coupon: { ...coupon, valid: false, times_redeemed: 20 } } }] });
    await configurePricing(stripe, true, "live", vi.fn());
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });
  it("creates a forever $250 coupon on the base product only, with two native 20-redemption caps", async () => {
    const stripe = client();
    stripe.promotionCodes.list.mockResolvedValue({ data: [] });
    stripe.coupons.retrieve.mockRejectedValue({ code: "resource_missing" });
    await configurePricing(stripe, true, "live", vi.fn());
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 25000, duration: "forever", max_redemptions: 20, applies_to: { products: ["prod_base"] } }), expect.anything());
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(expect.objectContaining({ code: "Founding20", active: false, max_redemptions: 20, restrictions: { first_time_transaction: true } }), expect.anything());
  });
});

it("requires an explicit activation step after staging a managed promotion", async () => {
  const stripe = client();
  stripe.promotionCodes.list.mockResolvedValue({ data: [{ ...promotion, active: false, metadata: { app_checkout_required: "true" } }] });
  await configurePricing(stripe, true, "live", vi.fn());
  expect(stripe.promotionCodes.update).not.toHaveBeenCalled();
  await configurePricing(stripe, true, "live", vi.fn(), true);
  expect(stripe.promotionCodes.update).toHaveBeenCalledWith(promotion.id, { active: true });
});

it("archives obsolete Growth prices for new purchases without changing existing subscriptions", async () => {
  const stripe = client();
  const list = stripe.prices.list.getMockImplementation();
  stripe.prices.list.mockImplementation(async (params: any) => {
    const result = await list(params);
    if (params.product === "prod_growth") result.data.push({ id: "old_growth_799", currency: "usd", unit_amount: 79900, recurring: { interval: "month", interval_count: 1 } });
    return result;
  });
  await configurePricing(stripe, true, "live", vi.fn());
  expect(stripe.prices.update).toHaveBeenCalledWith("old_growth_799", { active: false });
  expect(stripe.prices.update).not.toHaveBeenCalledWith("price_prod_growth", expect.anything());
});

it("archives the standalone $249 Starter product so new customers cannot bypass Founding20", async () => {
  const stripe = client();
  const search = stripe.products.search.getMockImplementation();
  stripe.products.search.mockImplementation((params: any) => params.query.includes("Starter") ? Promise.resolve({ data: [{ id: "prod_starter", name: "iSDRX AI Starter" }] }) : search(params));
  const prices = stripe.prices.list.getMockImplementation();
  stripe.prices.list.mockImplementation((params: any) => params.product === "prod_starter" ? Promise.resolve({ data: [{ id: "old_starter_249", currency: "usd", unit_amount: 24900, recurring: { interval: "month", interval_count: 1 } }] }) : prices(params));
  await configurePricing(stripe, true, "live", vi.fn());
  expect(stripe.products.update).toHaveBeenCalledWith("prod_starter", { active: false });
  expect(stripe.prices.update).toHaveBeenCalledWith("old_starter_249", { active: false });
});
