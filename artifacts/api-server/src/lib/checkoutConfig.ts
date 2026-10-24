export type CheckoutIntent = "buy_now" | "free_trial";

export function buildPlanCheckoutConfig(
  planPriceId: string,
  launchPackagePriceId: string | null,
  isNewSubscriber: boolean,
  checkoutIntent: CheckoutIntent,
) {
  const lineItems = [{ price: planPriceId, quantity: 1 }];
  const deferLaunchFee = isNewSubscriber && checkoutIntent === "free_trial";

  if (isNewSubscriber && !launchPackagePriceId) {
    throw new Error("Launch package price required for every new subscription");
  }

  if (isNewSubscriber && !deferLaunchFee) {
    lineItems.push({ price: launchPackagePriceId!, quantity: 1 });
  }

  return {
    line_items: lineItems,
    ...(deferLaunchFee
      ? {
          subscription_data: {
            trial_period_days: 14,
            metadata: {
              launch_package_fee_status: "deferred",
              launch_package_fee_price_id: launchPackagePriceId!,
            },
          },
        }
      : {}),
  };
}
