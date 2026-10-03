import { describe, expect, it, vi } from "vitest";
import { configureProductionStripeWebhook } from "./stripeWebhookStartup";

describe("Stripe webhook startup isolation", () => {
  it.each([
    {},
    { NODE_ENV: "development" },
    { NODE_ENV: "production" },
    { NODE_ENV: "production", REPLIT_DEPLOYMENT: "0" },
    { NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" },
    { REPLIT_DEPLOYMENT: "1" },
  ])("never invokes endpoint management outside published production: %j", async env => {
    const manage = vi.fn();
    const info = vi.fn();
    await configureProductionStripeWebhook({ findOrCreateManagedWebhook: manage }, { info }, env);
    expect(manage).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("skipped"));
  });

  it("keeps published production registration active", async () => {
    const manage = vi.fn().mockResolvedValue({});
    await configureProductionStripeWebhook({ findOrCreateManagedWebhook: manage }, { info: vi.fn() }, {
      NODE_ENV: "production", REPLIT_DEPLOYMENT: "1",
      REPLIT_DOMAINS: "example.com,example.replit.app",
    });
    expect(manage).toHaveBeenCalledExactlyOnceWith("https://example.com/api/stripe/webhook");
  });

  it.each([undefined, "", "undefined", "localhost", "app.replit.dev", "APP.REPLIT.DEV", "https://example.com", "example.com/path"])(
    "fails closed for an invalid production host: %s", async host => {
      const manage = vi.fn();
      await expect(configureProductionStripeWebhook({ findOrCreateManagedWebhook: manage }, { info: vi.fn() }, {
        NODE_ENV: "production", REPLIT_DEPLOYMENT: "1", REPLIT_DOMAINS: host,
      })).rejects.toThrow("valid production hostname");
      expect(manage).not.toHaveBeenCalled();
    },
  );
});