import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Checking for existing iSDRX AI Pro plan...");

    const existing = await stripe.products.search({ query: "name:'iSDRX AI Pro' AND active:'true'" });
    if (existing.data.length > 0) {
      console.log("iSDRX AI Pro already exists:", existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach(p => console.log(`  Price: $${(p.unit_amount ?? 0) / 100}/${(p.recurring as any)?.interval} — ${p.id}`));
      return;
    }

    const product = await stripe.products.create({
      name: "iSDRX AI Pro",
      description: "Full access to AI-powered sales development for janitorial companies — unlimited prospects, AI email sequences, call scripts, and real-time analytics.",
    });
    console.log("Created product:", product.id);

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 19700,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Monthly price: $197/month —", monthly.id);

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: 197000,
      currency: "usd",
      recurring: { interval: "year" },
    });
    console.log("Yearly price: $1970/year —", yearly.id);

    console.log("\n✓ Products created! Webhooks will sync them to the database.");
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

createProducts();
