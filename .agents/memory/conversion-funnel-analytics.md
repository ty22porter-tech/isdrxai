---
name: Conversion funnel analytics
description: Defines how marketing intent and completed business outcomes are counted and compared.
---

Use privacy-safe anonymous IDs for CTA intent, and record completed demo, trial, and purchase outcomes separately on the server. Replit-hosted analytics is supplementary; the private admin dashboard uses durable first-party events.

**Why:** Published analytics is useful for broad traffic analysis but is not an application data source. Anonymous clicks also cannot be matched perfectly across devices, so abandonment must not be presented as an exact person-level fact.

**How to apply:** Keep click payloads free of contact details and free-form text. Deduplicate retryable events, count unique visitors for intent, and label click-minus-completion values as estimates.