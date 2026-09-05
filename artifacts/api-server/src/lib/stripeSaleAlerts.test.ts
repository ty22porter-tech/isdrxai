import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getStripeSaleSummary } from "./stripeSaleAlerts";

function event(type: Stripe.Event.Type, object: unknown, id = "evt_sale_1"): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as Stripe.Event;
}

describe("getStripeSaleSummary", () => {
  it("summarizes a paid subscription invoice", () => {
    const summary = getStripeSaleSummary(event("invoice.paid", {
      id: "in_1",
      amount_paid: 75_000,
      currency: "usd",
      customer: "cus_1",
      customer_email: "buyer@example.com",
      customer_name: "Acme Services",
      billing_reason: "subscription_create",
      number: "INV-1001",
      lines: {
        data: [{ description: "iSDRX AI+ Engagement Follow-Up" }],
      },
    }));

    expect(summary).toMatchObject({
      eventType: "paid_sale",
      intent: "new_customer",
      title: "New Stripe sale completed",
      customer: "Acme Services",
      packageName: "iSDRX AI+ Engagement Follow-Up",
      amount: "$750.00",
    });
  });

  it("labels recurring invoices as renewals", () => {
    const summary = getStripeSaleSummary(event("invoice.paid", {
      id: "in_2",
      amount_paid: 49_900,
      currency: "usd",
      customer: "cus_2",
      customer_email: "buyer@example.com",
      billing_reason: "subscription_cycle",
      number: "INV-1002",
      lines: { data: [{ description: "iSDRX AI" }] },
    }));

    expect(summary?.title).toBe("Stripe renewal payment received");
    expect(summary?.intent).toBe("renewal");
  });

  it("ignores zero-dollar invoices", () => {
    const summary = getStripeSaleSummary(event("invoice.paid", {
      amount_paid: 0,
      currency: "usd",
      lines: { data: [] },
    }));

    expect(summary).toBeNull();
  });

  it("ignores subscription Checkout sessions to prevent duplicate alerts", () => {
    const summary = getStripeSaleSummary(event("checkout.session.completed", {
      id: "cs_1",
      mode: "subscription",
      payment_status: "paid",
      amount_total: 100_000,
      currency: "usd",
    }));

    expect(summary).toBeNull();
  });

  it("summarizes a standalone one-time Checkout payment", () => {
    const summary = getStripeSaleSummary(event("checkout.session.completed", {
      id: "cs_2",
      mode: "payment",
      payment_status: "paid",
      amount_total: 100_000,
      currency: "usd",
      customer_details: {
        email: "buyer@example.com",
        name: null,
      },
      metadata: { package_name: "iSDRX AI+ Setup" },
    }));

    expect(summary).toMatchObject({
      eventType: "paid_sale",
      intent: "one_time_sale",
      title: "New Stripe sale completed",
      customer: "buyer@example.com",
      packageName: "iSDRX AI+ Setup",
      amount: "$1,000.00",
    });
  });

  it("summarizes a new Stripe trial", () => {
    const summary = getStripeSaleSummary(event("customer.subscription.created", {
      id: "sub_1",
      status: "trialing",
      customer: "cus_trial",
      items: {
        data: [{
          price: {
            product: { name: "iSDRX AI", deleted: false },
          },
        }],
      },
    }));

    expect(summary).toMatchObject({
      eventType: "trial_started",
      intent: "free_trial",
      title: "New free trial started",
      packageName: "iSDRX AI",
    });
  });
});