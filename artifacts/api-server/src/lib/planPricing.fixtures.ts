export const basePrice = { id: "price_base", active: true, currency: "usd", unit_amount: 49900, recurring: { interval: "month", interval_count: 1 }, product: { id: "prod_base", name: "iSDRX AI", active: true } } as any;
export const coupon = { id: "founding_coupon", valid: true, amount_off: 25000, currency: "usd", duration: "forever", max_redemptions: 20, times_redeemed: 0, applies_to: { products: ["prod_base"] } } as any;
export const promotion = { id: "promo_founding", active: true, code: "Founding20", customer: null, customer_account: null, max_redemptions: 20, times_redeemed: 19, expires_at: null, restrictions: { first_time_transaction: true }, promotion: { type: "coupon", coupon } } as any;

