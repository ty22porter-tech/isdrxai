import { describe, expect, it } from "vitest";
import { buildPlanCheckoutConfig } from "./checkoutConfig";

describe("plan Checkout pricing", () => {
  it("starts a 14-day trial without adding the $995 one-time package to today's invoice", () => {
    expect(buildPlanCheckoutConfig("price_monthly", "price_launch", true, "free_trial")).toEqual({
      line_items: [{ price: "price_monthly", quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          launch_package_fee_status: "deferred",
          launch_package_fee_price_id: "price_launch",
        },
      },
    });
  });

  it("charges the launch package immediately for Buy Now", () => {
    expect(buildPlanCheckoutConfig("price_monthly", "price_launch", true, "buy_now")).toEqual({
      line_items: [
        { price: "price_monthly", quantity: 1 },
        { price: "price_launch", quantity: 1 },
      ],
    });
  });

  it("does not grant a second trial or charge the package on an existing subscription", () => {
    expect(buildPlanCheckoutConfig("price_monthly", "price_launch", false, "free_trial")).toEqual({
      line_items: [{ price: "price_monthly", quantity: 1 }],
    });
  });

  it("fails instead of silently omitting the fee for immediate checkout", () => {
    expect(() => buildPlanCheckoutConfig("price_monthly", null, true, "buy_now"))
      .toThrow("Launch package price required");
  });
});

describe("Founding20 onboarding waiver", () => {
  it.each(["buy_now", "free_trial"] as const)("applies the native capped promotion and never charges or defers onboarding for %s", intent => {
    const config = buildPlanCheckoutConfig("price_base_499", null, true, intent, { promotionId: "promo_first20", code: "Founding20" });
    expect(config.line_items).toEqual([{ price: "price_base_499", quantity: 1 }]);
    expect(config.discounts).toEqual([{ promotion_code: "promo_first20" }]);
    expect(config.subscription_data?.metadata).toEqual({ launch_package_fee_status: "waived", founding_promotion_code: "Founding20" });
    expect(config.subscription_data?.trial_period_days).toBe(intent === "free_trial" ? 14 : undefined);
  });
});
