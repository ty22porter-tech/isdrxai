---
name: Conversion funnel analytics
description: Defines how marketing intent and completed business outcomes are counted and compared.
---

Use privacy-safe anonymous IDs for CTA intent, and record completed demo, trial, and purchase outcomes separately on the server. Replit-hosted analytics is supplementary; the private admin dashboard uses durable first-party events.

**Why:** Published analytics is useful for broad traffic analysis but is not an application data source. Anonymous clicks also cannot be matched perfectly across devices, so abandonment must not be presented as an exact person-level fact.

**How to apply:** Keep click payloads free of contact details and free-form text. Deduplicate retryable events, count unique visitors for intent, and label click-minus-completion values as estimates.

## Known visitor reporting

Stripe visitor counts mean unique authenticated accounts with successfully created checkout sessions, not confirmed Stripe page views. Count sessions separately and do not interpret same-period purchases as a checkout cohort conversion rate.

**Why:** The user requested Stripe visitor counts, but the app cannot observe whether a hosted checkout page fully loaded. One account may start checkout repeatedly.

The user chose activity from known leads and signed-in users, not third-party identification of anonymous companies. Identified activity requires a separate opt-in and stays in the private admin report; never forward identities to general analytics.

**Why:** A browser or an email domain does not prove a person's identity or employer. Form submissions are self-reported, while account activity must derive identity from server authentication.

**How to apply:** Label form leads as unverified and email domains as email domains. Keep sessions separate across account switches, reject client-supplied user IDs, honor withdrawal, and do not equate browser-session rows with unique people.