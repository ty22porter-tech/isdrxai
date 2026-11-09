import { PLAN_CATALOG, isCurrentPlanPrice, foundingDiscount, PromotionError } from "../lib/planPricing";
import { Router } from "express";
import { db, usersTable, conversionEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";
import { buildPlanCheckoutConfig } from "../lib/checkoutConfig";

const router = Router();
router.use(requireAuth);

const CURRENT_TERMS_VERSION = "2026-11-08-founding20";

router.get("/subscription", async (req, res) => {
  const user = req.dbUser;
  const trialEndsAt = user.trialEndsAt ? user.trialEndsAt.toISOString() : null;
  if (!user.stripeSubscriptionId) {
    return res.json({ subscription: null, status: user.status, trialEndsAt });
  }
  try {
    const stripe = await getUncachableStripeClient();
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    return res.json({ subscription, status: user.status, trialEndsAt });
  } catch {
    return res.json({ subscription: null, status: user.status, trialEndsAt });
  }
});

const LAUNCH_PACKAGE_NAME = "AI Sales Launch Package";
let launchPackagePriceId: string | null = null;

async function getLaunchPackagePriceId(): Promise<string | null> {
  if (launchPackagePriceId) return launchPackagePriceId;
  try {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.search({
      query: `name:'${LAUNCH_PACKAGE_NAME}' AND active:'true'`,
    });
    const product = products.data.find(p => p.name === LAUNCH_PACKAGE_NAME);
    if (!product) return null;
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const oneTime = prices.data.find((p) => !p.recurring && p.currency === "usd" && p.unit_amount === 99500);
    launchPackagePriceId = oneTime?.id ?? null;
    return launchPackagePriceId;
  } catch {
    return null;
  }
}

const SUBSCRIPTION_PLAN_NAMES = new Set(Object.keys(PLAN_CATALOG));

router.post("/checkout", async (req, res) => {
  const { priceId, acceptTerms, checkoutIntent, promoCode } = req.body;
  if (!priceId || typeof priceId !== "string") {
    return res.status(400).json({ error: "priceId required" });
  }
  if (acceptTerms !== true) {
    return res.status(400).json({
      error: "You must review and accept the Terms of Service before checkout.",
    });
  }
  if (checkoutIntent !== "buy_now" && checkoutIntent !== "free_trial") {
    return res.status(400).json({ error: "A valid checkout option is required." });
  }

  const user = req.dbUser;
  const stripe = await getUncachableStripeClient();
  let price;
  try { price = await stripe.prices.retrieve(priceId, { expand: ["product"] }); }
  catch { return res.status(400).json({ error: "Invalid plan selected" }); }
  if (!isCurrentPlanPrice(price)) return res.status(400).json({ error: "Invalid plan selected" });
  let promotion;
  try { promotion = await foundingDiscount(stripe, promoCode, price); }
  catch (error) {
    if (error instanceof PromotionError) return res.status(400).json({ error: error.message });
    req.log.error({ err: error }, "Promotion verification failed");
    return res.status(503).json({ error: "Promotional code verification is unavailable. Please retry; no checkout was created." });
  }
  // A canceled previous subscription does not make the same account a new founding customer.
  if (promotion && user.stripeSubscriptionId) return res.status(400).json({ error: "Founding20 is for new subscribing customers only." });

  // Existing subscribers manage plan changes through the billing portal —
  // never through a fresh checkout (which would grant another trial).
  if (user.stripeSubscriptionId) {
    try {
      const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      if (existing.status === "active" || existing.status === "trialing" || existing.status === "past_due") {
        return res.status(400).json({
          error: "You already have a subscription. Use the billing portal to change plans.",
        });
      }
    } catch {
      // Subscription no longer exists in Stripe — allow a new checkout.
    }
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, user.id));
    customerId = customer.id;
  }

  // The one-time onboarding fee applies to new subscribers except verified
  // Founding20 redemptions. Fail closed if a required fee price is missing.
  const isNewSubscriber = !user.stripeSubscriptionId;
  let packagePriceId: string | null = null;
  if (isNewSubscriber && !promotion) {
    packagePriceId = await getLaunchPackagePriceId();
    if (!packagePriceId) {
      return res.status(500).json({
        error: "Checkout is temporarily unavailable. Please try again shortly.",
      });
    }
  }
  const checkoutConfig = buildPlanCheckoutConfig(
    priceId,
    packagePriceId,
    isNewSubscriber,
    checkoutIntent,
    promotion,
  );

  // Record the server-owned terms version immediately before creating the
  // checkout session. The client cannot choose the version or timestamp.
  await db
    .update(usersTable)
    .set({
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    mode: "subscription",
    ...checkoutConfig,
    ...(isNewSubscriber
      ? {
          custom_text: {
            submit: {
              message:
                promotion
                  ? `Founding20 accepted: $249/month for the qualifying iSDRX AI subscription, with the $995 Launch Package waived. The discount continues while you keep this subscription. ${checkoutIntent === "free_trial" ? "No charge during your 14-day trial; $249/month begins if you continue. Cancel before trial end to avoid subscription charges." : "Subscription billing starts at checkout."}`
                  : checkoutIntent === "free_trial"
                  ? "No subscription or $995 Onboarding / Sales Launch Package charge during your 14-day trial. If you continue, your first paid invoice includes your monthly subscription plus the one-time $995 package. Cancel before the trial ends to avoid both charges. The package includes account and email/domain setup, calendar integration, ideal customer targeting, campaign and CRM setup, implementation, and training."
                  : "Your purchase includes the one-time $995 Onboarding / Sales Launch Package, covering account and email/domain setup, calendar integration, ideal customer targeting, campaign and CRM setup, implementation, and training.",
            },
          },
        }
      : {}),
    // Codes must be entered in the app before Checkout, so both monthly price
    // and onboarding treatment are computed together. Never expose a second
    // Stripe-only code field that could discount the plan without waiving the fee.
    ...(promotion ? {} : { allow_promotion_codes: false }),
    success_url: `${baseUrl}/app/billing?checkout=success&onboarding=1`,
    cancel_url: `${baseUrl}/app/pricing`,
  });

  if (!session.url) return res.status(502).json({ error: "Stripe did not return a checkout URL. Please try again." });
  // Server-confirmed session creation, not a claimed view of Stripe's page.
  // Analytics failures must never prevent an otherwise valid checkout.
  try {
    await db.insert(conversionEventsTable).values({
      eventType: "checkout_started",
      intent: "stripe_checkout",
      location: "pricing",
      userId: user.id,
      sourceKey: `checkout-started:${session.id}`,
    }).onConflictDoNothing({ target: conversionEventsTable.sourceKey });
  } catch {
    req.log.warn("Checkout created but checkout-start reporting failed");
  }
  return res.json({ url: session.url });
});

router.post("/billing-portal", async (req, res) => {
  const user = req.dbUser;
  if (!user.stripeCustomerId) {
    return res.status(400).json({ error: "No billing account found. Please subscribe first." });
  }

  const stripe = await getUncachableStripeClient();
  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/billing`,
  });

  return res.json({ url: session.url });
});

router.get("/products", async (_req, res) => {
  try {
    // Checkout must use Stripe's authoritative catalog. The synchronized
    // database can lag behind (especially after a new production database is
    // created), which previously made valid plans appear unavailable.
    const stripe = await getUncachableStripeClient();
    const products = await Promise.all(
      Array.from(SUBSCRIPTION_PLAN_NAMES).map(async (name) => {
        const matches = await stripe.products.search({
          query: `name:'${name}' AND active:'true'`,
        });
        const product = matches.data.find((candidate) => candidate.name === name);
        if (!product) return null;

        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 100,
        });
        const monthlyPrice = prices.data.find(
          (price) => isCurrentPlanPrice({ ...price, product }),
        );
        if (!monthlyPrice) return null;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          monthlyPriceId: monthlyPrice.id,
          prices: prices.data.map((price) => ({
            id: price.id,
            unitAmount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval ?? null,
          })),
        };
      }),
    );

    return res.json({ products: products.filter((product) => product !== null) });
  } catch {
    return res.status(503).json({
      error: "The subscription catalog is temporarily unavailable. Please try again shortly.",
    });
  }
});

export default router;
