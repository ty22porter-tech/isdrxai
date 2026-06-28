import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";

const router = Router();
router.use(requireAuth);

router.get("/subscription", async (req, res) => {
  const user = req.dbUser;
  if (!user.stripeSubscriptionId) {
    return res.json({ subscription: null, status: user.status });
  }
  try {
    const stripe = await getUncachableStripeClient();
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    res.json({ subscription, status: user.status });
  } catch {
    res.json({ subscription: null, status: user.status });
  }
});

router.post("/checkout", async (req, res) => {
  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: "priceId required" });

  const user = req.dbUser;
  const stripe = await getUncachableStripeClient();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, user.id));
    customerId = customer.id;
  }

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${baseUrl}/?checkout=success`,
    cancel_url: `${baseUrl}/billing`,
  });

  res.json({ url: session.url });
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

  res.json({ url: session.url });
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
        products[row.id].prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }
    res.json({ products: Object.values(products) });
  } catch {
    res.json({ products: [] });
  }
});

export default router;
