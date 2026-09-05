---
name: Leadership dashboard scope
description: Defines the distinct reporting and authorization boundaries for Overview, client Leadership, and Platform Leadership.
---

Keep three reporting surfaces distinct: Overview is the operational client home, Leadership is an executive view scoped to the authenticated client, and Platform Leadership is a cross-client view restricted to admins.

Leadership API percentages use a 0–100 scale, not 0–1. Selected date windows apply to activity totals and trends; current pipeline and cumulative campaign counters must be labeled honestly when they are not period-scoped.

**Why:** The user explicitly requested both client leadership reporting and a separate admin-global view. Mixing these scopes risks cross-tenant data exposure and misleading metrics.

**How to apply:** Every tenant leadership query must filter by client ID. Mount platform aggregates only behind admin authorization. Keep Overview focused on daily work and Leadership focused on trends, rates, and comparison.