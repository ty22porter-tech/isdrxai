---
name: Opportunity intelligence integrity
description: Trust, evidence, and separation rules for Opportunity Scores.
---

Opportunity Intelligence is a server-derived snapshot. Never trust client-supplied score arithmetic; recompute supplied snapshots from trusted prospect fields and current seller context. Preserve null for legacy or manual prospects that have no snapshot.

**Why:** Client snapshots can be stale or tampered with, while search-listing facts establish business identity and contactability but do not prove purchases, hiring, expansion, budgets, provider changes, or other buying events.

**How to apply:** Keep verified facts, implications, and unconfirmed signals separate. Verified buying signals get full weight, implications limited weight, and unknowns zero. Keep the Opportunity Score completely independent from engagement score and Hot/Medium/Low behavior. Factual email clauses must each be grounded in verified evidence or explicitly conditional.