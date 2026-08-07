---
name: Apollo.io integration status
description: Apollo API key state and plan limitation for prospect search
---

- A valid APOLLO_API_KEY secret is saved (verified via api.apollo.io auth; header `X-Api-Key`).
- **Blocker:** the user's Apollo account is on the Free plan — all search endpoints (e.g. `api/v1/mixed_companies/search`, `mixed_people/search`) return 403 `API_INACCESSIBLE`. Any paid plan unlocks full API access.
- **Decision (Jul 21, 2026):** user chose to keep the built-in mock prospect generator for now; no Apollo code was wired into `/prospect-search`. Revisit when they upgrade Apollo.
- **Update (Aug 7, 2026):** people-enrichment IS wired (POST /prospects/bulk-enrich, api-server apollo lib, "Enrich with Apollo" button on Prospects page). Still plan-blocked: retested people/match → 403 API_INACCESSIBLE. Route detects that and returns planBlocked:true → friendly upgrade toast; works automatically once user upgrades Apollo. Enrichment merges are non-destructive (placeholder phone only, fills empty city/state, keeps existing values); LinkedIn URLs sanitized to https://*.linkedin.com; route gated by requireEntitlement; 100-prospect cap, 5-way concurrency, 10s per-call timeout.
- **Why:** building Apollo-first search would break live prospect search with 403s until the plan upgrade.
- **How to apply:** when asked to enable "real" Apollo prospect search, first re-test the key against a search endpoint to confirm the plan was upgraded, then wire Apollo into the api-server prospect-search route.
- Lesson: users may paste page URLs instead of API keys, and the secret prompt can append rather than replace — diagnose by checking value length/slashes without printing it.
