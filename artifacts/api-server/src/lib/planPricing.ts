import type Stripe from "stripe";

export const PLAN_CATALOG = {
  "iSDRX AI": { monthlyAmount: 49900, emails: 1000, users: 1 },
  "iSDRX AI Growth": { monthlyAmount: 74900, emails: 3000, users: 3 },
} as const;
export const FOUNDING_CODE = "Founding20";
export const FOUNDING_LIMIT = 20;
export const FOUNDING_COUPON_ID = "isdrxai_founding20_v1";

export function isCurrentPlanPrice(price: Stripe.Price): boolean {
  const product = price.product;
  if (typeof product === "string" || product.deleted || !product.active) return false;
  const plan = PLAN_CATALOG[product.name as keyof typeof PLAN_CATALOG];
  return !!plan && price.active && price.currency === "usd" && price.unit_amount === plan.monthlyAmount
    && price.recurring?.interval === "month" && price.recurring.interval_count === 1;
}

export class PromotionError extends Error {}
export function validateFoundingCoupon(coupon: Stripe.Coupon, productId: string) {
  if (!coupon.valid || coupon.amount_off !== 25000 || coupon.currency !== "usd"
    || coupon.duration !== "forever" || coupon.max_redemptions !== FOUNDING_LIMIT
    || coupon.applies_to?.products.length !== 1 || coupon.applies_to.products[0] !== productId) {
    throw new PromotionError("Founding20 is unavailable or has reached its 20-customer limit. No checkout was created.");
  }
}

/** Stripe owns redemption counting and enforces the cap again at Checkout completion. */
export async function foundingDiscount(stripe: Stripe, code: unknown, price: Stripe.Price) {
  if (code === undefined || code === null || code === "") return null;
  if (typeof code !== "string" || code.trim().toLowerCase() !== FOUNDING_CODE.toLowerCase()) {
    throw new PromotionError("Invalid promotional code. Enter Founding20, or remove the code to continue at standard pricing.");
  }
  const product = price.product;
  if (typeof product === "string" || product.deleted || product.name !== "iSDRX AI") {
    throw new PromotionError("Founding20 applies only to the $499 iSDRX AI plan, not Growth, Enterprise, or AI+.");
  }
  const matches = await stripe.promotionCodes.list({ code: FOUNDING_CODE, active: true, limit: 100, expand: ["data.promotion.coupon"] });
  const codes = matches.data.filter(p => p.code.toLowerCase() === FOUNDING_CODE.toLowerCase() && !p.customer && !p.customer_account);
  if (codes.length !== 1) throw new PromotionError("Founding20 is unavailable or has reached its 20-customer limit. No checkout was created.");
  const promotion = codes[0];
  if (!promotion.active || promotion.max_redemptions !== FOUNDING_LIMIT || promotion.times_redeemed >= FOUNDING_LIMIT
    || !promotion.restrictions.first_time_transaction || (promotion.expires_at && promotion.expires_at <= Date.now() / 1000)) {
    throw new PromotionError("Founding20 is unavailable or has reached its 20-customer limit. No checkout was created.");
  }
  const coupon = promotion.promotion.coupon;
  if (!coupon || typeof coupon === "string") throw new PromotionError("Founding20 could not be verified. No checkout was created.");
  validateFoundingCoupon(coupon, product.id);
  return { promotionId: promotion.id, code: FOUNDING_CODE };
}
