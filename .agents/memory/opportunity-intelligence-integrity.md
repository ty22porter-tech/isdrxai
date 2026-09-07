---
name: Opportunity intelligence integrity
description: Trust, evidence, and separation rules for Opportunity Scores.
---

Opportunity Intelligence is a server-derived snapshot. Never trust client-supplied score arithmetic; recompute supplied snapshots from trusted prospect fields and current seller context. Preserve null for legacy or manual prospects that have no snapshot.

**Why:** Client snapshots can be stale or tampered with, while search-listing facts establish business identity and contactability but do not prove purchases, hiring, expansion, budgets, provider changes, or other buying events.

**How to apply:** Keep verified facts, implications, and unconfirmed signals separate. Verified buying signals get full weight, implications limited weight, and unknowns zero. Keep the Opportunity Score completely independent from engagement score and Hot/Medium/Low behavior. Factual email clauses must each be grounded in verified evidence or explicitly conditional.

On prospect cards, keep Opportunity Intelligence in the compact legacy-style format: short labeled rows for why target, potential needs, the strongest verified signal, and recommended outreach. Omit empty, negative, unknown, and unverified findings instead of rendering “no result” sections; the full evidence report belongs only in the score-breakdown dialog.

**Why:** The inline report overwhelmed each prospect card and consumed most of the page. Users need quick positive relevance cues while scanning results, with detail revealed only when requested.

**How to apply:** Limit compact rows and text length, show at most the strongest positive evidence, and skip empty secondary categories. Keep an explicit weak-fit or no-current-signal conclusion in “Why target” so missing evidence is never hidden.

“Why target” must explain why this specific seller should spend time on the prospect. Lead with the strongest current verified buying signal, then verified operating-model relevance, approved seller capability fit, qualified ICP fit, and potential value. Company identity/contactability evidence must never be the primary reason.

**Why:** Address, website, phone, and business-listing verification prove that a prospect is real and reachable, but they do not establish urgency or sales relevance. Industry categories are also only hypotheses until the prospect's own official source verifies its operating model.

**How to apply:** Keep contactability weight minimal. Label industry-only reasoning as unverified. Historical or undated events may be context but must not be called timely. Fleet presence proves an operating model, not vehicle purchasing; only sourced, dated change events such as purchases, new routes, fleet expansion, or rebrands count as buying signals.