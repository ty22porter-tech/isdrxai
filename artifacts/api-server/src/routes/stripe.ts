import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";

const router = Router();
router.use(requireAuth);

const CURRENT_TERMS_VERSION = "2026-09-05";

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
    const product = products.data[0];
    if (!product) return null;
    const prices = await stripe.prices.list({ product: product.id, active: true });
    const oneTime = prices.data.find((p) => !p.recurring);
    launchPackagePriceId = oneTime?.id ?? null;
    return launchPackagePriceId;
  } catch {
    return null;
  }
}

const SUBSCRIPTION_PLAN_NAMES = new Set([
  "iSDRX AI Starter",
  "iSDRX AI",
  "iSDRX AI Growth",
]);

async function isAllowedPlanPrice(priceId: string): Promise<boolean> {
  try {
    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    if (!price.active || price.recurring?.interval !== "month") return false;
    const product = price.product;
    if (typeof product === "string" || product.deleted) return false;
    return product.active === true && SUBSCRIPTION_PLAN_NAMES.has(product.name);
  } catch {
    return false;
  }
}

router.post("/checkout", async (req, res) => {
  const { priceId, acceptTerms, checkoutIntent } = req.body;
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

  if (!(await isAllowedPlanPrice(priceId))) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }

  const user = req.dbUser;
  const stripe = await getUncachableStripeClient();

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

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: priceId, quantity: 1 },
  ];

  // The AI Sales Launch Package is a mandatory one-time fee for every new
  // subscriber. If it can't be resolved, fail the checkout rather than
  // silently dropping the required fee.
  const isNewSubscriber = !user.stripeSubscriptionId;
  if (isNewSubscriber) {
    const packagePriceId = await getLaunchPackagePriceId();
    if (!packagePriceId) {
      return res.status(500).json({
        error: "Checkout is temporarily unavailable. Please try again shortly.",
      });
    }
    lineItems.push({ price: packagePriceId, quantity: 1 });
  }

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
    line_items: lineItems,
    mode: "subscription",
    // A trial is granted only when a first-time customer explicitly chooses it.
    ...(isNewSubscriber && checkoutIntent === "free_trial"
      ? { subscription_data: { trial_period_days: 14 } }
      : {}),
    allow_promotion_codes: true,
    success_url: `${baseUrl}/app/billing?checkout=success&onboarding=1`,
    cancel_url: `${baseUrl}/app/pricing`,
  });

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
    const result = await db.execute(
      sql`SELECT p.id, p.name, p.description, pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring
          FROM stripe.products p
          LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
          WHERE p.active = true
          ORDER BY pr.unit_amount ASC`
    );
    const products: Record<string, any> = {};
    for (const row of result.rows as any[]) {
      if (!products[row.id]) {
        products[row.id] = { id: row.id, name: row.name, description: row.description, prices: [] };
      }
      if (row.price_id) {
        let recurring = row.recurring;
        if (typeof recurring === "string") {
          try {
            recurring = JSON.parse(recurring);
          } catch {
            recurring = null;
          }
        }
        const interval =
          recurring && typeof recurring === "object" && "interval" in recurring
            ? recurring.interval
            : null;
        products[row.id].prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          interval,
        });
        if (interval === "month") {
          products[row.id].monthlyPriceId = row.price_id;
        }
      }
    }
    res.json({ products: Object.values(products) });
  } catch {
    res.json({ products: [] });
  }
});

export default router;
