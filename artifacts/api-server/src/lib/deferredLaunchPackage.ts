import type Stripe from "stripe";
import { logger } from "./logger";

type SubscriptionInvoice = {
  id: string;
  billing_reason: string | null;
  customer: string | { id: string } | null;
  parent?: {
    subscription_details?: { subscription: string | { id: string } } | null;
  } | null;
};

type StripeBillingClient = Pick<Stripe, "invoiceItems" | "subscriptions">;

/**
 * Attach the deferred one-time launch fee to the first paid subscription-cycle
 * invoice after a trial. Pinning the item to the draft invoice keeps it off the
 * initial $0 trial invoice and avoids charging accounts that cancel in trial.
 */
export async function addDeferredLaunchPackageToTrialEndInvoice(
  invoice: SubscriptionInvoice,
  stripe: StripeBillingClient,
): Promise<boolean> {
  if (invoice.billing_reason !== "subscription_cycle") return false;

  const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!subscriptionId || !customerId) return false;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata.launch_package_fee_status !== "deferred") return false;

  const packagePriceId = subscription.metadata.launch_package_fee_price_id;
  if (!packagePriceId) {
    throw new Error(`Deferred launch package price missing for subscription ${subscriptionId}`);
  }

  const existingItems = await stripe.invoiceItems.list({ invoice: invoice.id, limit: 100 });
  const itemAlreadyAttached = existingItems.data.some(
    (item) =>
      item.metadata?.source === "deferred_trial_launch_package" &&
      item.metadata?.subscription_id === subscriptionId,
  );
  if (!itemAlreadyAttached) {
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        invoice: invoice.id,
        pricing: { price: packagePriceId },
        description: "AI Sales Launch Package (one-time)",
        metadata: {
          source: "deferred_trial_launch_package",
          subscription_id: subscriptionId,
        },
      },
      { idempotencyKey: `launch-package-trial-end:${invoice.id}` },
    );
  }

  // Stripe merges subscription metadata updates. Marking this after the
  // idempotent invoice-item create makes webhook retries safe and prevents
  // charging the package on later monthly invoices.
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      launch_package_fee_status: "charged",
      launch_package_fee_invoice_id: invoice.id,
    },
  });

  logger.info(
    { invoiceId: invoice.id, subscriptionId },
    "Deferred AI Sales Launch Package added to first post-trial invoice",
  );
  return true;
}
