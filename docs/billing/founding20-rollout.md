# Pricing and Founding20 rollout

## Approved terms

- **iSDRX AI:** $499/month, up to 1,000 personalized AI emails and 1 user; the full existing $499 feature offering.
- **Founding20:** a discount on that same plan, not a separate Starter tier. The first 20 eligible new customers to successfully redeem the code receive $249/month while they keep the qualifying subscription. Their $995 onboarding fee is waived. No code means no discount or waiver.
- **Growth:** $749/month, up to 3,000 personalized AI emails and up to 3 users.
- **Enterprise and AI+:** unchanged.
- Standard onboarding is $995. Buy Now charges it at checkout; ordinary trial subscriptions defer it until trial end. Founding20 trial subscriptions never acquire a deferred onboarding fee.
- Existing subscriptions are not repriced, canceled, upgraded, or migrated by this update. Historical prices are preserved for existing subscriptions, but obsolete monthly prices and the standalone Starter product are archived to prevent new purchases at retired prices. The old $249/500-email Starter price is no longer offered by the app and cannot be used for a new app checkout.

## How the promotion works

Customers must enter `Founding20` **in the app's pricing/terms dialog before continuing to Stripe**. A code field only on Stripe's hosted checkout cannot safely coordinate both the monthly discount and the onboarding waiver. The app therefore does not offer that separate hosted code field.

The server verifies the real Stripe price and promotion. Stripe's coupon deducts $250/month forever from the $499 base product only. Both coupon and promotion have a native limit of 20 redemptions. The promotion is restricted to first-time Stripe customers; the app also rejects previous subscriber accounts. Stripe enforces redemption limits at Checkout, including concurrent attempts. Successful redemption during a trial consumes an offer use; opening a session alone is not a promised reservation. Existing discounted subscriptions continue after the code reaches its limit.

The app omits onboarding only for the verified promotion and sets subscription metadata `launch_package_fee_status=waived`. The trial-end fee handler skips waived subscriptions. Invalid, exhausted, or unverifiable entered codes stop checkout; customers must explicitly remove a rejected code to proceed at regular pricing.

Prices and capacity metadata are configured in Stripe. This change does not add a new email quota enforcement or multi-user invitation system; those remain the app's existing account capabilities.

## Before applying in Replit

Use the connected Stripe account and the intended live/test mode. Never paste secrets into chat. Preserve local changes before pulling the update. Install dependencies, rebuild shared types, and run the billing tests and all required builds.

The command runs in **dry-run mode by default**. `--apply` makes catalog changes. `--mode` checks the connected Stripe account's mode before making changes. Existing promotion redemption history is never reset. Duplicate or incompatible promotions fail for review instead of creating another 20-use pool.

## Test-mode validation first

Using a Stripe TEST connection:

```sh
pnpm --filter @workspace/api-server run pricing:configure --mode=test
pnpm --filter @workspace/api-server run pricing:configure --mode=test --apply --activate-promotion
```

Verify hosted test checkouts without charging real customers:

1. Base plan without a code: $499/month plus $995 onboarding for Buy Now.
2. Base plan with valid Founding20: $249/month, no onboarding, same 1,000-email/1-user offering.
3. Trial without a code: no charge during the trial; $499 plus $995 on the first post-trial invoice if continued.
4. Trial with Founding20: no trial-period charge; $249/month afterward and no onboarding invoice item.
5. Growth without a code: $749/month, 3,000-email/3-user catalog metadata, ordinary onboarding.
6. Growth plus Founding20, invalid code, and exhausted code: checkout rejected with a clear message.
7. Old Starter price supplied directly to the checkout endpoint: rejected.
8. Confirm promotion limits and forever duration in Stripe; test limit boundaries with separate disposable test fixtures so testing does not consume live offer uses.

## Live rollout order

1. In Replit with the LIVE Stripe connection, run:

   ```sh
   pnpm --filter @workspace/api-server run pricing:configure --mode=live
   ```

2. Review the dry-run output. Then stage the new catalog:

   ```sh
   pnpm --filter @workspace/api-server run pricing:configure --mode=live --apply
   ```

   The script creates a missing promotion **inactive** by default. It updates the two self-service plan products, verifies or creates the $995 one-time onboarding price, and creates missing immutable prices; it archives obsolete new-purchase prices and the old Starter product while leaving Enterprise, AI+, and existing subscriptions alone. Re-running does not reset redemption counts. An existing matching promotion's state is preserved, so inspect it during rollout if it was created previously.

3. Rebuild the API, app frontend, and public landing website. Verify development displays the code requirement, waived-onboarding terms, current feature table, and $749 Growth plan.
4. After the owner approves publishing, publish the updated app/API and landing site together. Verify the new checkout endpoint is live **before activating** a newly staged promotion. The old checkout cannot coordinate the waiver.
5. Before activation, review any legacy payment links or still-open Checkout sessions created by the old app. They may contain the old onboarding line or offer a Stripe-only code field. Direct customers to a fresh app checkout; do not activate the code on an unreviewed legacy checkout flow. Then activate the managed promotion only after the new deployment:

   ```sh
   pnpm --filter @workspace/api-server run pricing:configure --mode=live --apply --activate-promotion
   ```

6. Verify the live catalog and promotion configuration without purchasing or redeeming the live offer for QA. Confirm invalid-code handling without creating charges. Do not perform live subscriptions or consume customer offer uses as a test.

If the live code was already active before this rollout, inspect existing usage and coordinate the deployment; do not replace it or reset history. If catalog or promotion settings do not match, stop and review the reported mismatch. Do not auto-migrate existing subscribers or change Enterprise/AI+ prices.

## Current execution limitation

The Codex workspace has no Stripe secret or Replit Stripe connector binding. The script and app can be tested with mocks here; live/test Stripe account configuration must be executed from the authorized Replit connection. Publishing code alone does not create Stripe prices or activate the promotion.
