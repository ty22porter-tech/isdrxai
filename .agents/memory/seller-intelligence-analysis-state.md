---
name: Seller intelligence analysis state
description: Concurrency and failure-state rules for automatic and manual Company Intelligence analysis.
---

Serialize each account's website-analysis decision with a database-backed per-account lock, then re-read the user row before deciding whether a first-save or website-change analysis is needed.

**Why:** Concurrent Settings saves can otherwise both observe stale website/profile state and duplicate an expensive crawl. A process-local lock is insufficient when the app can run on multiple instances.

**How to apply:** Keep the analysis decision and final Settings write inside the same locked transaction. Persist the last analysis-attempt outcome separately from the active profile status so a failed refresh remains visible while same-company cached facts stay active. If analysis resolves to a different hostname, never retain the previous company's user overrides.