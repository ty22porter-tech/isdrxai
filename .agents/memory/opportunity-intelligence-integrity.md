---
name: Opportunity intelligence integrity
description: Trust, evidence, and separation rules for Opportunity Scores.
---

Opportunity Intelligence is a server-derived snapshot. Never trust client-supplied score arithmetic; recompute supplied snapshots from trusted prospect fields and current seller context. Preserve null for legacy or manual prospects that have no snapshot.

The research-based sections supersede the older narrative restrictions below: **Industry Challenges**, **Prospect Concerns**, and **Recommended Solutions and Outreach**, contextualized by the seller's “Your Industry.” IT Services uses the IT-specific titles. Industry-based possibilities are explicitly requested and allowed when labeled as possibilities, never promoted to verified buying signals.

**Why:** The user's IT research specification deliberately separates industry context, company evidence, and seller solutions. Suppressing every industry-based possibility would contradict that request; treating one as verified would also contradict it.

**How to apply:** Preserve source links, uncertainty, selected-versus-actual industry distinctions, and positive business-value explanations. Match only confirmed seller offerings. Use actual researched business classification in company-specific outreach when the selected search industry differs.

A prospect publishing a customer story or industry threat report does not establish an operational problem at that prospect, even when several citations share its official domain.

**Why:** In live IT research, a technology vendor's healthcare materials were mistaken for evidence that the vendor itself faced healthcare-provider concerns. Domain identity proves the publisher, not the subject of a claim.

**How to apply:** Distinguish company operations from customer/industry context before granting Verified or Strong Indicator labels. Keep customer and industry context explicitly conditional.

The report reviewed in search must survive saving after an application restart or on another server instance. Do not rely only on a process-local cache or silently replace a reviewed report with different research during Add.

**Why:** Published autoscale instances do not share memory, while users can restore search results days later. The trust boundary must protect report integrity without making saves depend on the original process.

**How to apply:** Preserve authenticated server-issued research handoffs across search, enrichment, refresh, and save. Rebuild score arithmetic on the server; reject invalid or outdated handoffs with a clear refresh instruction.

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

**How to apply:** For each positive signal, render a concise company-specific challenge plus the matched approved seller capability/outcome. A verified official-site or Apollo organization description may support discovery narratives when no buying event exists, but must stay at zero buying-signal points and explicitly avoid claiming a current problem or purchase intent. Industry compliance, plausible cyber threats, and employee count cannot populate Potential Needs or Recommended Outreach by themselves. Compliance context may appear only when a verified company-specific security/compliance signal makes it relevant and it maps to an approved seller offering. Keep the sections concise and do not reuse the same wording in Recommended Outreach.

For fleet-wrap prospects, Why Target, Potential Needs, and Recommended Outreach must come from verified individual-company signals such as official mobile-service evidence, vehicle evidence, relevant hiring, rebrands, acquisitions, or expansion. Never create these narratives from the industry label alone.

**Why:** Industry-template fallbacks made different fleet prospects show the same outreach and needs, defeating the purpose of company intelligence.

**How to apply:** Why Target cites the company signal, Potential Needs interprets a distinct conditional challenge tied to an approved seller offering, and Recommended Outreach asks a separate evidence-led discovery question. If no company-specific signal exists, do not fabricate generic fleet narratives.

**Recommended Outreach** must name the prospect, choose the most relevant approved seller offer, and explain why that service fits the prospect’s documented workflow. Never replace this with a generic no-signal warning or a repeated conditional closing.

**Why:** Users need an actionable course of action, while generic caution text neither differentiates the prospect nor identifies the seller's best relevant offer.

**How to apply:** Use a verified company event as the reason for timing and match offer relevance semantically rather than taking the first configured service. For IT Services and Fleet & Vehicle Wraps, treat the priority-services field as the user-approved, per-client solution catalog. Prospect website evidence or a verified company event supplies the individualized challenge, and the strongest matching catalog solution supplies the recommendation; website-extracted seller services remain fallback options. For Janitorial, an official company operating profile may produce all three discovery outcomes by connecting the documented workplace type and workflow to a ready, approved seller offering, while explicitly avoiding claims that a cleaning gap or purchase intent is verified. Never hard-code one seller’s catalog into shared matching. Do not append “If discovery confirms…” boilerplate, and suppress generic CTAs such as “Contact Us.” Keep enrichment-provider names internal; display neutral language such as “Company operating profile.” Company size and industry/compliance context can inform scoring or interpretation, but cannot create outreach copy without an individualized verified signal.

An evidence-based Opportunity Score of 30 or higher is fit for the user to call and should be visibly identified as **Fit to Call**. This designation means the prospect clears the user’s calling threshold; it still does not claim purchase intent or a verified buying event.

**Why:** The user wants moderately matched accounts available for human discovery calls without weakening the evidence standards behind the score.

**How to apply:** Scores from 30–59 receive at least the Possible Fit label and a Fit to Call indicator. Keep all existing score evidence, confidence, and no-purchase-probability language intact.

Public breach records require exact organization-name and state matching. Describe a government portal entry as a submitted public record and never imply the incident is unresolved.

**Why:** Organization names collide, and a reported breach does not prove current exposure or incomplete remediation.

**How to apply:** Cite the authoritative portal, submission date, reported type, and affected system/data context. A non-match means “not found in the records checked,” never “no breach.”

On prospect cards, keep Opportunity Intelligence in the compact legacy-style format: short labeled rows for why target, potential needs, and recommended outreach. Do not show the Verified Signal row on Janitorial, IT Services, or Fleet & Vehicle Wrap cards. Omit empty, negative, unknown, and unverified findings instead of rendering “no result” sections; the full evidence report belongs only in the score-breakdown dialog.

**Why:** The inline report overwhelmed each prospect card and consumed most of the page. Users need quick positive relevance cues while scanning results, with detail revealed only when requested.

**How to apply:** Show each compact response in full through at most five complete sentences, without character truncation, ellipses, or visual line clamping. Include up to five useful Potential Needs and omit empty or negative results. Preserve verified evidence in View Score Breakdown even though it is hidden on the card.