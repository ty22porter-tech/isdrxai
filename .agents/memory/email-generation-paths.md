---
name: Email & call-script generation paths
description: The multiple content-generation paths in ai-sdr and the rules every generator must follow (client injection, no body signature).
---

# Content-generation paths (there is more than one — check all)

There are at least three places that produce outreach copy. A bug fixed in one does
NOT fix the others — verify the actual caller before assuming a path is dead.

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

## Note on historical records
Already-`sent` rows in `emails` keep their old (wrong-branding) body — that's sent
history, don't rewrite it. The fix only affects newly generated/sent copy.
