---
name: Opportunity intelligence integrity
description: Trust, evidence, and separation rules for Opportunity Scores.
---

Opportunity Intelligence is a server-derived snapshot. Never trust client-supplied score arithmetic; recompute supplied snapshots from trusted prospect fields and current seller context. Preserve null for legacy or manual prospects that have no snapshot.

**Why:** Client snapshots can be stale or tampered with, while search-listing facts establish business identity and contactability but do not prove purchases, hiring, expansion, budgets, provider changes, or other buying events.

**How to apply:** Keep verified facts, implications, and unconfirmed signals separate. Verified buying signals get full weight, implications limited weight, and unknowns zero. Keep the Opportunity Score completely independent from engagement score and Hot/Medium/Low behavior. Factual email clauses must each be grounded in verified evidence or explicitly conditional.

Opportunity scoring must not award generic baseline points for selected industry, seller readiness, configured priorities, or an assumed business need. Every positive category must contain prospect-specific evidence showing exactly why the points were earned. Seller-match points require a semantic match between that evidence and an approved seller offer; a zero-relevance offer is not a match.

**Why:** Generic baseline points cause unrelated prospects to receive identical “Possible Fit” scores and make the breakdown look individualized when it is not.

**How to apply:** Preserve this exact 100-point rubric: Company/ICP Fit 20, Verified Buying Signals 30, Seller-to-Prospect Match 20, Decision-Maker Match 10, Signal Freshness 10, Business Need Potential 10. Calculate points only from verified prospect identity/demographics, sourced buying evidence, evidence-to-offer matches, verified decision makers, signal freshness, and seller-addressable needs. Legitimate ties are acceptable when evidence is genuinely identical; never force uniqueness with random or name-derived points.

Google Places listing, address, website, and phone facts are validation/scoring inputs only. Never include them in **Why Target**; that narrative must use target-worthy evidence, a possible business challenge, and an approved seller capability.

**Why:** Identity and contactability explain why a record is credible, not why the seller should pursue the account.

**How to apply:** Keep Google validation facts and sourced demographics in the company-fit breakdown and evidence model. Build **Why Target** only from a positive company-specific buying signal connected to a semantically relevant approved seller offer. Never use listing availability, employee count alone, or generic industry/compliance context as the fallback; omit Why Target when no individualized basis exists.

**Potential Needs** must originate from verified prospect research signals, then state the possible business challenge and connect it to an approved seller offer and outcome. Do not manufacture a generic list when research finds nothing.

**Why:** A generic industry issue is not evidence that a specific prospect has that need, and a seller priority is not proof the seller can solve it.

**How to apply:** For each positive signal, render a concise company-specific challenge plus the matched approved seller capability/outcome. For IT prospects, applicable industry compliance and plausible cyber threats may form a clearly conditional discovery hypothesis only when tied to a semantically relevant approved seller offering; they never become verified buying signals or scored business needs. Keep it to two natural sentences and do not reuse the same wording in Recommended Outreach.

**Recommended Outreach** must name the prospect, choose the most relevant approved seller offer, explain the evidence-based timing or verified demographic fit, and end with an approved seller CTA. Never replace this with a generic no-signal warning.

**Why:** Users need an actionable course of action, while generic caution text neither differentiates the prospect nor identifies the seller's best relevant offer.

**How to apply:** Prefer verified company events, then verified company size, then applicable industry/compliance context. Match offer relevance semantically rather than taking the first configured service.

Public breach records require exact organization-name and state matching. Describe a government portal entry as a submitted public record and never imply the incident is unresolved.

**Why:** Organization names collide, and a reported breach does not prove current exposure or incomplete remediation.

**How to apply:** Cite the authoritative portal, submission date, reported type, and affected system/data context. A non-match means “not found in the records checked,” never “no breach.”

On prospect cards, keep Opportunity Intelligence in the compact legacy-style format: short labeled rows for why target, potential needs, the strongest verified signal, and recommended outreach. Omit empty, negative, unknown, and unverified findings instead of rendering “no result” sections; the full evidence report belongs only in the score-breakdown dialog.

**Why:** The inline report overwhelmed each prospect card and consumed most of the page. Users need quick positive relevance cues while scanning results, with detail revealed only when requested.

**How to apply:** Show each compact response in full through at most five complete sentences, without character truncation, ellipses, or visual line clamping. Include up to five useful Potential Needs, show at most the strongest positive verified signal, and omit empty or negative results.