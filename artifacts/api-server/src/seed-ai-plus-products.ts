import Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";

type CatalogItem = {
  key: string;
  name: string;
  description: string;
  unitAmount: number;
  recurring?: Stripe.PriceCreateParams.Recurring;
};

const CATALOG: CatalogItem[] = [
  {
    key: "ai_plus_setup",
    name: "iSDRX AI+ Setup",
    description:
      "One-time AI+ onboarding for scripting, caller training, CRM configuration, and campaign preparation.",
    unitAmount: 100_000,
  },
  {
    key: "ai_plus_engagement_follow_up",
    name: "iSDRX AI+ Engagement Follow-Up",
    description:
      "Monthly AI+ service add-on for professional follow-up with hot and highly engaged prospects who have not scheduled. Requires an active iSDRX AI base subscription and renews monthly until canceled.",
    unitAmount: 75_000,
    recurring: { interval: "month" },
  },
  {
    key: "ai_plus_outbound_calling",
    name: "iSDRX AI+ Outbound Calling",
    description:
      "Monthly AI+ service add-on providing approximately 20–30 calling hours per month. Requires an active iSDRX AI base subscription and renews monthly until canceled.",
    unitAmount: 150_000,
    recurring: { interval: "month" },
  },
  {
    key: "ai_plus_dedicated_caller",
    name: "iSDRX AI+ Dedicated Caller",
    description:
      "Monthly AI+ service add-on providing a dedicated or near-full-time caller with live transfers. Requires an active iSDRX AI base subscription and renews monthly until canceled.",
    unitAmount: 300_000,
    recurring: { interval: "month" },
  },
];

async function findProduct(stripe: Stripe, item: CatalogItem) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  return products.data.find(
    (product) =>
      product.metadata.catalog_key === item.key || product.name === item.name,
  );
}

async function ensureCatalogItem(stripe: Stripe, item: CatalogItem) {
  let product = await findProduct(stripe, item);

  if (!product) {
    product = await stripe.products.create({
      name: item.name,
      description: item.description,
      metadata: {
        catalog_key: item.key,
        catalog_group: "isdrx_ai_plus",
        purchase_flow: "sales_assisted",
      },
    });
    console.log(`Created product: ${item.name}`);
  } else {
    product = await stripe.products.update(product.id, {
      name: item.name,
      description: item.description,
      metadata: {
        ...product.metadata,
        catalog_key: item.key,
        catalog_group: "isdrx_ai_plus",
        purchase_flow: "sales_assisted",
      },
    });
    console.log(`Updated product: ${item.name}`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const matchingPrice = prices.data.find(
    (price) =>
      price.currency === "usd" &&
      price.unit_amount === item.unitAmount &&
      (item.recurring
        ? price.recurring?.interval === item.recurring.interval
        : price.type === "one_time"),
  );

  if (matchingPrice) {
    console.log(`Price already exists: ${item.name}`);
    return;
  }

  await stripe.prices.create({
    product: product.id,
    unit_amount: item.unitAmount,
    currency: "usd",
    recurring: item.recurring,
    metadata: {
      catalog_key: item.key,
      purchase_flow: "sales_assisted",
    },
  });
  console.log(`Created price: ${item.name}`);
}

async function seedAiPlusProducts() {
  const stripe = await getUncachableStripeClient();

  for (const item of CATALOG) {
    await ensureCatalogItem(stripe, item);
  }

  console.log(
    "AI+ Stripe catalog is ready. Additional Caller remains sales-quoted and has no automatic Stripe price.",
  );
}

seedAiPlusProducts().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to seed AI+ Stripe products: ${message}`);
  process.exit(1);
});