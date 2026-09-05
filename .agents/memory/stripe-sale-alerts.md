---
name: Stripe sale alerts
description: The approved notification policy for successful Stripe payments.
---

Every successful paid package sale and recurring renewal must notify all admin accounts through both the in-app notification center and the email address on each admin account. Stripe retries must not produce duplicate alerts.

**Why:** Leadership wants immediate visibility into every sale while keeping the notification recipient tied to authorized admin accounts instead of a hardcoded private address.

**How to apply:** Treat paid invoices as the canonical source for subscriptions, renewals, and invoiced setup charges. Treat paid one-time Checkout sessions as standalone sales, and ignore zero-dollar activity.