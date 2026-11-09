import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ stripe: { prices: { retrieve: vi.fn(), list: vi.fn() }, products: { search: vi.fn() }, promotionCodes: { list: vi.fn() }, subscriptions: { retrieve: vi.fn() }, customers: { create: vi.fn() }, checkout: { sessions: { create: vi.fn() } } }, update: vi.fn(), insert: vi.fn() }));
vi.mock("../stripeClient", () => ({ getUncachableStripeClient: async () => mocks.stripe }));
vi.mock("../lib/requireAuth", () => ({ requireAuth: vi.fn() }));
vi.mock("@workspace/db", async original => ({ ...await original<typeof import("@workspace/db")>(), db: { update: mocks.update, insert: mocks.insert } }));
import router from "./stripe";
import { basePrice, promotion } from "../lib/planPricing.fixtures";

async function checkout(patch = {}, userPatch = {}) {
  const layer = router.stack.find((item: any) => item.route?.path === "/checkout") as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await layer.route.stack.at(-1).handle({ body: { priceId: "price_base", acceptTerms: true, checkoutIntent: "buy_now", ...patch }, dbUser: { id: "qa", email: "qa@example.test", stripeCustomerId: "cus_qa", stripeSubscriptionId: null, ...userPatch }, log: { error: vi.fn(), warn: vi.fn() } }, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
  mocks.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => [] }) });
  mocks.stripe.prices.retrieve.mockResolvedValue(basePrice);
  mocks.stripe.promotionCodes.list.mockResolvedValue({ data: [promotion] });
  mocks.stripe.products.search.mockResolvedValue({ data: [{ id: "prod_launch", name: "AI Sales Launch Package" }] });
  mocks.stripe.prices.list.mockResolvedValue({ data: [{ id: "price_launch", currency: "usd", unit_amount: 99500, recurring: null }] });
  mocks.stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_qa", url: "https://checkout.stripe.com/test" });
});

describe("subscription checkout pricing boundary", () => {
  it("without code charges the $499 plan and $995 onboarding even if the client asks for a waiver", async () => {
    const res = await checkout({ waiveOnboarding: true, discountedPrice: 249 });
    expect(res.status).not.toHaveBeenCalled();
    const payload = mocks.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(payload.line_items).toEqual([{ price: "price_base", quantity: 1 }, { price: "price_launch", quantity: 1 }]);
    expect(payload.discounts).toBeUndefined();
    expect(payload.allow_promotion_codes).toBe(false);
  });
  it.each(["buy_now", "free_trial"])("Founding20 produces the correct discount and waiver for %s", async checkoutIntent => {
    const res = await checkout({ promoCode: "Founding20", checkoutIntent });
    expect(res.status).not.toHaveBeenCalled();
    const payload = mocks.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(payload.line_items).toEqual([{ price: "price_base", quantity: 1 }]);
    expect(payload.discounts).toEqual([{ promotion_code: "promo_founding" }]);
    expect(payload.subscription_data.metadata.launch_package_fee_status).toBe("waived");
    expect(payload.custom_text.submit.message).toContain("$249/month");
    expect(payload.allow_promotion_codes).toBeUndefined();
  });
  it("stops an exhausted code rather than silently creating full-price checkout", async () => {
    mocks.stripe.promotionCodes.list.mockResolvedValue({ data: [{ ...promotion, times_redeemed: 20 }] });
    const res = await checkout({ promoCode: "Founding20" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rejects an old $249 Starter price as a coupon-free bypass", async () => {
    mocks.stripe.prices.retrieve.mockResolvedValue({ ...basePrice, unit_amount: 24900, product: { ...basePrice.product, name: "iSDRX AI Starter" } });
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("does not grant Founding20 to an account with a previous subscription", async () => {
    const res = await checkout({ promoCode: "Founding20" }, { stripeSubscriptionId: "sub_old" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
