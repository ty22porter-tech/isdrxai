import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDeferredLaunchPackageToTrialEndInvoice } from "./deferredLaunchPackage";

const { create, list, retrieve, update } = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn(),
}));

const stripe = {
  invoiceItems: { create, list },
  subscriptions: { retrieve, update },
} as any;

const invoice = {
  id: "in_trial_end",
  billing_reason: "subscription_cycle",
  customer: "cus_test",
  parent: {
    type: "subscription_details",
    subscription_details: { subscription: "sub_test" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  retrieve.mockResolvedValue({
    metadata: {
      launch_package_fee_status: "deferred",
      launch_package_fee_price_id: "price_launch",
    },
  });
  create.mockResolvedValue({});
  list.mockResolvedValue({ data: [] });
  update.mockResolvedValue({});
});

describe("deferred trial launch package", () => {
  it("adds the fee to the first post-trial invoice, not as a pending customer item", async () => {
    await expect(addDeferredLaunchPackageToTrialEndInvoice(invoice, stripe)).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        invoice: "in_trial_end",
        pricing: { price: "price_launch" },
      }),
      { idempotencyKey: "launch-package-trial-end:in_trial_end" },
    );
    expect(list).toHaveBeenCalledWith({ invoice: "in_trial_end", limit: 100 });
    expect(update).toHaveBeenCalledWith("sub_test", {
      metadata: {
        launch_package_fee_status: "charged",
        launch_package_fee_invoice_id: "in_trial_end",
      },
    });
  });

  it("does not attach the fee to the initial trial invoice or unrelated invoices", async () => {
    await expect(addDeferredLaunchPackageToTrialEndInvoice(
      { ...invoice, billing_reason: "subscription_create" }, stripe,
    )).resolves.toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not charge a subscription without a deferred launch fee", async () => {
    retrieve.mockResolvedValue({ metadata: { launch_package_fee_status: "charged" } });
    await expect(addDeferredLaunchPackageToTrialEndInvoice(invoice, stripe)).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not duplicate the fee when a webhook retries after the item was attached", async () => {
    list.mockResolvedValue({
      data: [{
        metadata: {
          source: "deferred_trial_launch_package",
          subscription_id: "sub_test",
        },
      }],
    });
    await expect(addDeferredLaunchPackageToTrialEndInvoice(invoice, stripe)).resolves.toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("sub_test", expect.objectContaining({
      metadata: expect.objectContaining({ launch_package_fee_status: "charged" }),
    }));
  });

  it("fails for missing deferred price metadata so the webhook can retry rather than silently lose the fee", async () => {
    retrieve.mockResolvedValue({ metadata: { launch_package_fee_status: "deferred" } });
    await expect(addDeferredLaunchPackageToTrialEndInvoice(invoice, stripe))
      .rejects.toThrow("Deferred launch package price missing");
    expect(create).not.toHaveBeenCalled();
  });

  it("supports expanded Stripe customer and subscription objects", async () => {
    await expect(addDeferredLaunchPackageToTrialEndInvoice({
      ...invoice,
      customer: { id: "cus_test" },
      parent: {
        subscription_details: { subscription: { id: "sub_test" } },
      },
    }, stripe)).resolves.toBe(true);
    expect(retrieve).toHaveBeenCalledWith("sub_test");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_test" }), expect.anything());
  });

  it("supports older webhook endpoints that provide a top-level subscription", async () => {
    await expect(addDeferredLaunchPackageToTrialEndInvoice({
      ...invoice,
      parent: null,
      subscription: "sub_test",
    }, stripe)).resolves.toBe(true);
    expect(retrieve).toHaveBeenCalledWith("sub_test");
  });

  it("does not mark the subscription paid if creating the invoice item fails", async () => {
    create.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(addDeferredLaunchPackageToTrialEndInvoice(invoice, stripe))
      .rejects.toThrow("Stripe unavailable");
    expect(update).not.toHaveBeenCalled();
  });
});
