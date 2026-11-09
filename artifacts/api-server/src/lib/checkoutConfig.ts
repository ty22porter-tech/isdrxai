import type Stripe from "stripe";
export type CheckoutIntent = "buy_now" | "free_trial";

export function buildPlanCheckoutConfig(
  planPriceId: string,
  launchPackagePriceId: string | null,
  isNewSubscriber: boolean,
  checkoutIntent: CheckoutIntent,
  foundingPromotion?: { promotionId: string; code: string } | null,
): Pick<Stripe.Checkout.SessionCreateParams, "line_items" | "subscription_data" | "discounts"> {
  const lineItems = [{ price: planPriceId, quantity: 1 }];
  const waived = isNewSubscriber && !!foundingPromotion;
  const deferLaunchFee = isNewSubscriber && !waived && checkoutIntent === "free_trial";

  if (isNewSubscriber && !waived && !launchPackagePriceId) {
    throw new Error("Launch package price required for every new subscription");
  }

  if (isNewSubscriber && !waived && !deferLaunchFee) {
    lineItems.push({ price: launchPackagePriceId!, quantity: 1 });
  }

  return {
    line_items: lineItems,
    ...(waived ? {
      discounts: [{ promotion_code: foundingPromotion!.promotionId }],
      subscription_data: {
        ...(checkoutIntent === "free_trial" ? { trial_period_days: 14 } : {}),
        metadata: { launch_package_fee_status: "waived", founding_promotion_code: foundingPromotion!.code },
      },
    } : {}),
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
