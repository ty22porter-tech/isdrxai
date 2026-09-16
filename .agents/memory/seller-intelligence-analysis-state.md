---
name: Seller intelligence analysis state
description: Concurrency and failure-state rules for automatic and manual Company Intelligence analysis.
---

Serialize each account's seller-research decision with a database-backed per-account lock, then re-read the user row before deciding whether company-name or seller-industry research is needed.

**Why:** Concurrent Settings saves and prospect research can otherwise observe stale profile state and duplicate expensive web research. A process-local lock is insufficient when the app can run on multiple instances.

**How to apply:** Keep the analysis decision and final Settings write inside the same locked transaction. Persist the last analysis-attempt outcome separately from the active profile status so a failed refresh remains visible while same-company cached facts stay active. Never carry one company's facts or approvals to a different company; determine identity from the researched company rather than a contact-website edit. Rebrands discovered in research are not automatically different companies.