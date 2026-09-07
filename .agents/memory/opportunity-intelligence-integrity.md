---
name: Opportunity intelligence integrity
description: Trust, evidence, and separation rules for Opportunity Scores.
---

Opportunity Intelligence is a server-derived snapshot. Never trust client-supplied score arithmetic; recompute supplied snapshots from trusted prospect fields and current seller context. Preserve null for legacy or manual prospects that have no snapshot.

**Why:** Client snapshots can be stale or tampered with, while search-listing facts establish business identity and contactability but do not prove purchases, hiring, expansion, budgets, provider changes, or other buying events.

**How to apply:** Keep verified facts, implications, and unconfirmed signals separate. Verified buying signals get full weight, implications limited weight, and unknowns zero. Keep the Opportunity Score completely independent from engagement score and Hot/Medium/Low behavior. Factual email clauses must each be grounded in verified evidence or explicitly conditional.

On prospect cards, keep Opportunity Intelligence in the compact legacy-style format: short labeled rows for why target, potential needs, the strongest verified signal, and recommended outreach. Omit empty, negative, unknown, and unverified findings instead of rendering “no result” sections; the full evidence report belongs only in the score-breakdown dialog.

**Why:** The inline report overwhelmed each prospect card and consumed most of the page. Users need quick positive relevance cues while scanning results, with detail revealed only when requested.

**How to apply:** Limit compact rows and text length, show at most the strongest positive evidence, and skip to the next available item when a category has no useful result.