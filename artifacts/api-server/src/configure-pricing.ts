import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { PLAN_CATALOG, FOUNDING_CODE, FOUNDING_LIMIT, FOUNDING_COUPON_ID, validateFoundingCoupon } from "./lib/planPricing";

/** Idempotent catalog update. Existing subscriptions are never migrated. Old prices are archived for new sales, not repriced. */
export async function configurePricing(stripe: Stripe, apply: boolean, mode: "live" | "test", log = console.log, activatePromotion = false) {
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== (mode === "live")) throw new Error(`Stripe mode mismatch: expected ${mode}. No changes made.`);
  log(`Stripe ${mode}; ${apply ? "APPLY" : "DRY RUN (no writes)"}`);
  let baseProductId: string | undefined;
  for (const [name, plan] of Object.entries(PLAN_CATALOG)) {
    const found = await stripe.products.search({ query: `name:'${name}' AND active:'true'`, limit: 100 });
    const exact = found.data.filter(p => p.name === name);
    if (exact.length > 1) throw new Error(`Multiple active products named ${name}; resolve ambiguity before applying.`);
    let product = exact[0];
    if (!product && apply) product = await stripe.products.create({ name }, { idempotencyKey: `pricing-v2-product:${name}` });
    if (!product) { log(`Would create ${name}: $${plan.monthlyAmount / 100}/month, ${plan.emails} emails, ${plan.users} user(s).`); continue; }
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    let price = prices.data.find(p => p.currency === "usd" && p.unit_amount === plan.monthlyAmount && p.recurring?.interval === "month" && p.recurring.interval_count === 1);
    if (!price && apply) price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: plan.monthlyAmount, recurring: { interval: "month" }, metadata: { catalog_version: "founding20-v1" } }, { idempotencyKey: `pricing-v2-price:${product.id}:${plan.monthlyAmount}` });
    if (apply) await stripe.products.update(product.id, {
      ...(price ? { default_price: price.id } : {}),
      metadata: { monthly_email_capacity: String(plan.emails), included_users: String(plan.users), catalog_version: "founding20-v1" },
    });
    for (const old of prices.data.filter(p => p.currency === "usd" && p.recurring?.interval === "month" && p.unit_amount !== plan.monthlyAmount)) {
      if (apply) await stripe.prices.update(old.id, { active: false });
      log(`${apply ? "Archived" : "Would archive"} obsolete new-purchase price ${old.id}; existing subscription billing unchanged.`);
    }
    if (name === "iSDRX AI") baseProductId = product.id;
    log(`${name}: $${plan.monthlyAmount / 100}/month; ${plan.emails} emails; ${plan.users} user(s). ${price ? "Price ready." : "Would create monthly price."}`);
  }
  const legacy = await stripe.products.search({ query: "name:'iSDRX AI Starter' AND active:'true'", limit: 100 });
  for (const product of legacy.data.filter(p => p.name === "iSDRX AI Starter")) {
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    if (apply) {
      await stripe.products.update(product.id, { active: false });
      for (const price of prices.data) await stripe.prices.update(price.id, { active: false });
    }
    log(`${apply ? "Archived" : "Would archive"} standalone Starter for new purchases; existing subscriptions unchanged.`);
  }
  const launchName = "AI Sales Launch Package";
  const launchMatches = await stripe.products.search({ query: `name:'${launchName}' AND active:'true'`, limit: 100 });
  const launchProducts = launchMatches.data.filter(p => p.name === launchName);
  if (launchProducts.length > 1) throw new Error("Multiple active onboarding products; resolve ambiguity before checkout.");
  let launch = launchProducts[0];
  if (!launch && apply) launch = await stripe.products.create({ name: launchName }, { idempotencyKey: "pricing-v2-launch-product" });
  if (launch) {
    const prices = await stripe.prices.list({ product: launch.id, active: true, limit: 100 });
    let price = prices.data.find(p => !p.recurring && p.currency === "usd" && p.unit_amount === 99500);
    if (!price && apply) price = await stripe.prices.create({ product: launch.id, currency: "usd", unit_amount: 99500 }, { idempotencyKey: `pricing-v2-launch-price:${launch.id}` });
    if (apply && price) await stripe.products.update(launch.id, { default_price: price.id });
    log(`Onboarding: $995 one-time. ${price ? "Price ready." : "Would create price."} Waived only for verified Founding20 checkout.`);
  } else log("Would create the $995 one-time onboarding product and price.");
  if (!baseProductId) { log("Would create Founding20 after the base product: $250 off forever; first 20 redeemers; onboarding waived in app checkout."); return; }
  const existing = await stripe.promotionCodes.list({ code: FOUNDING_CODE, limit: 100, expand: ["data.promotion.coupon"] });
  const matches = existing.data.filter(p => p.code.toLowerCase() === FOUNDING_CODE.toLowerCase());
  if (matches.length > 1) throw new Error("Multiple Founding20 codes exist. No replacement code will be created; review their restrictions and prior redemptions.");
  if (matches.length) {
    const p = matches[0];
    const coupon = p.promotion.coupon;
    if (!coupon || typeof coupon === "string" || p.customer || p.customer_account || p.max_redemptions !== FOUNDING_LIMIT || !p.restrictions.first_time_transaction) throw new Error("Existing Founding20 has incompatible terms. It was not modified or reset.");
    validateFoundingCoupon({ ...coupon, valid: true }, baseProductId);
    if (apply && activatePromotion && !p.active) {
      if (!coupon.valid || p.times_redeemed >= FOUNDING_LIMIT || (p.expires_at && p.expires_at <= Date.now() / 1000) || p.metadata?.app_checkout_required !== "true") throw new Error("This inactive Founding20 code cannot be activated safely. History was not reset.");
      await stripe.promotionCodes.update(p.id, { active: true });
      log("Founding20 activated after the app rollout. Existing redemption count preserved.");
    }
    log(`Existing Founding20 preserved: ${p.times_redeemed}/${FOUNDING_LIMIT} redemptions; ${p.active ? "active" : "inactive"}. Redemption history was not reset.`);
    return;
  }
  let coupon: Stripe.Coupon | undefined;
  try { const found = await stripe.coupons.retrieve(FOUNDING_COUPON_ID); if (!("deleted" in found)) coupon = found; }
  catch (error: any) { if (error.code !== "resource_missing") throw error; }
  if (coupon) validateFoundingCoupon({ ...coupon, valid: true }, baseProductId);
  if (coupon && coupon.times_redeemed >= FOUNDING_LIMIT) { log("Founding20 coupon is exhausted; no new code created."); return; }
  if (!apply) { log("Would create Founding20: $250 off the base plan forever, max 20, first-time customers only. App checkout waives onboarding."); return; }
  coupon ??= await stripe.coupons.create({ id: FOUNDING_COUPON_ID, name: "Founding20 — $249/month while subscribed", amount_off: 25000, currency: "usd", duration: "forever", max_redemptions: FOUNDING_LIMIT, applies_to: { products: [baseProductId] } }, { idempotencyKey: "isdrxai-founding20-coupon-v1" });
  await stripe.promotionCodes.create({ code: FOUNDING_CODE, promotion: { type: "coupon", coupon: coupon.id }, active: activatePromotion, max_redemptions: FOUNDING_LIMIT, restrictions: { first_time_transaction: true }, metadata: { onboarding_waived: "true", app_checkout_required: "true" } }, { idempotencyKey: "isdrxai-founding20-code-v1" });
  log(`Founding20 created ${activatePromotion ? "ACTIVE" : "INACTIVE (activate only after publishing the new checkout)"}: $249/month while subscribed; app waives onboarding; limit 20.`);
}

if (process.argv[1]?.endsWith("configure-pricing.ts")) {
  const mode = process.argv.find(arg => arg.startsWith("--mode="))?.split("=")[1];
  if (mode !== "live" && mode !== "test") { console.error("Supply --mode=test or --mode=live. Add --apply only after reviewing a dry run."); process.exitCode = 1; }
  else getUncachableStripeClient().then(stripe => configurePricing(stripe, process.argv.includes("--apply"), mode, console.log, process.argv.includes("--activate-promotion"))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
