---
name: Email & call-script generation paths
description: The multiple content-generation paths in ai-sdr and the rules every generator must follow (client injection, no body signature).
---

# Content-generation paths (there is more than one — check all)

There are at least three places that produce outreach copy. A bug fixed in one does
NOT fix the others — verify the actual caller before assuming a path is dead.

**Why:** An explanation once incorrectly attributed the prospect-detail button to the LLM route. A later email contained internal research instructions because its actual path assembled report fields directly.

**How to apply:** Trace the UI hook through its generated URL before describing or changing generation. Research advice such as “Focus on…” is input for a writer, not customer-facing email text; never treat a recommendation's messaging instructions as a finished paragraph.

- **`api-server/src/routes/ai.ts`** — DETERMINISTIC template (not AI). Serves
  `/api/ai/generate-email` + `/api/ai/generate-call-script`. Called by the frontend
  **`prospect-detail.tsx`** ("Regenerate" button + call-script preview) via generated
  hooks `useGenerateEmail` / `useGenerateCallScript`. Recognizable output: fixed subject
  lines like "Commercial cleaning proposal for {company}" / "Janitorial services tailored
  for {industry} facilities in {city}" and a bulleted value-prop list.
- **`api-server/src/routes/openai.ts`** — real LLM path, `/api/openai/generate-email`.
  Called by `sequences.tsx` and `campaigns.tsx`.
- **`ai-sdr/src/lib/email-ai.ts`** — CLIENT-SIDE fallback template (`generateEmailForStep`),
  used only when the API call fails/doesn't override. Signs off as "Your SDR Team".

## Rules every generator must obey
- **Load the authenticated client and inject `senderName`/`businessName`.** Never bake a
  literal rep name or company into template copy. This exact bug ("Alex Carter" /
  "CleanPro Janitorial Services") appeared in BOTH ai.ts and openai.ts at different times.
  **Why:** app is multi-tenant; hardcoded identity leaks the wrong brand to every client.
- **Do NOT put a signature/sign-off in the generated body.** The send path
  (`routes/emails.ts` POST → `lib/emailCompose.ts composeEmail()`) appends the real
  signature (senderName, businessName, phone, outreachEmail) + CAN-SPAM footer. A body
  signature = duplicate sign-off with possibly-wrong details. openai.ts enforces this via
  an explicit `noSignatureRule`; ai.ts must simply end at the CTA.
- **Scope every prospect lookup by `req.clientId`** (`and(eq(id), eq(clientId))`).
  ai.ts originally fetched prospects by id alone = cross-tenant IDOR.
- **IT outreach email bodies must never contain the word “free,” including generic
  phrases such as “feel free.”** Use “IT assessment” without that qualifier, and keep
  an output guard on the LLM path because prompt instructions alone are not guaranteed.
  **Why:** this is an explicit copy requirement for the IT campaign vertical.
- **`composeEmail` owns links/CTAs — generators must NOT emit raw URLs.** `composeEmail`
  takes an optional `cta?: {label,url}` that renders a clean `<a>label</a>` (HTML) plus a
  `label: url` text fallback. The walkthrough/scheduling prompt (`generateCalendlyEmail`)
  must be told to reference the "Schedule walkthrough" link without writing any URL.
  **Why:** a raw `/schedule/<uuid>` URL in the body gets ugly Gmail auto-linkification and
  looks spammy; letting composeEmail render the anchor keeps one clean link.
- **Prospect greetings use only the contact's first name in every vertical.** Apply this
  to manual campaign sends, Send All, sequence follow-ups, engagement automation, and
  Autopilot. Keep the server send boundary as the final enforcement point, including
  correcting drafts that were already merged with a full name.
  **Why:** campaign paths historically personalized inconsistently, producing a mix of
  “Hi Austin” and “Hi Austin Wheeler.”
  **How to apply:** include sample-data campaign previews in greeting checks, not only real
  recipient sends. Keep full names in recipient metadata; shorten greetings, not every
  occurrence of a name in the message.
- **Autopilot relevance review rewrites once but does not block merely for a low score.**
  After the rewrite, send ordinary low-relevance copy and block only clear factual risks:
  unsupported prospect claims, explicit guarantees, or unapproved seller-service claims.
  **Why:** the former fixed score threshold paused legitimate campaigns without giving
  users enough information or a reliable recovery path.

## Deliverability / Gmail Promotions (composeEmail footer)
- CAN-SPAM legally requires a functional opt-out + physical postal address in the body —
  keep those. The `List-Unsubscribe` / `List-Unsubscribe-Post: One-Click` headers are a
  deliverability/mailbox-provider best practice, **not** a statutory requirement (don't
  call them "legally required").
- To fight Promotions-tab placement, the footer is kept visually quiet: no `<hr>` divider,
  small muted (`#9ca3af`) text, so it reads like a personal 1:1 email, not a newsletter.
  **Reality:** code tweaks only improve odds — Gmail categorization is driven mostly by
  domain reputation + engagement + volume, and cannot be guaranteed. Removing the bulk
  List-Unsubscribe headers *might* nudge Primary but risks the spam folder (worse), so it
  was deliberately NOT done.

## Note on historical records
Already-`sent` rows in `emails` keep their old (wrong-branding) body — that's sent
history, don't rewrite it. The fix only affects newly generated/sent copy.
