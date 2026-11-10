# GPT-6 Astra medium migration

The OpenAI text generation and web-research requests support `gpt-6-astra`
with explicit medium reasoning when `OPENAI_ASTRA_ENABLED=true`. The switch is
off by default: chat continues using GPT-5.4 and research GPT-5.4-mini until
the deployed provider is verified. Enthusiastic human writing instructions apply
in either mode. Shared settings live in
`artifacts/api-server/src/lib/aiModelSettings.ts`.

Outreach prompts request an enthusiastic, warm, conversational human tone,
without exaggerated claims, fabricated familiarity, or excessive punctuation.
Research instructions require evidence, correct company/contact identity, and
clear separation of facts from inference. There is no IQ setting or guaranteed
human IQ score. This change concerns written tone, not audio synthesis.

## Scope and compatibility

- Covers email drafts, campaign/autopilot writing, gift follow-up and suggestions,
  company demographics, seller research, opportunity research, recruiting discovery,
  gift offer comparison, and the existing OpenAI gift-research fallback.
- Astra-enabled plain-text calls retain Chat Completions with `reasoning_effort: "medium"`.
- Astra-enabled web-search calls retain Responses with `reasoning: { effort: "medium" }`.
- Existing web-search tools, source validation, JSON contracts, relevance checks,
  contact enrichment, and send/approval rules remain in place.
- Existing Gemini fallback routing and specialized image/audio models are unchanged.
- Astra-enabled visible-answer token budgets gain 8,192 tokens of reasoning headroom.
  Prompt word limits still govern email length. This allowance is an initial budget,
  not a guarantee against truncation; validate real outputs before production.

Enabling Astra upgrades calls previously using GPT-5.4 **and** GPT-5.4-mini.
Astra-enabled research no longer uses the cheaper mini model. Measure actual cost and latency, especially
on research requests with short timeouts, before deploying.

## Validation and release status

Local validation uses mocked model responses and synthetic credentials. Passing
tests validates application request/response contracts, not Astra's writing quality
or access through the deployed Replit model gateway.

## Replit activation procedure

1. Pull the integrated update, preserve local changes, install dependencies, rebuild, and restart development with `OPENAI_ASTRA_ENABLED` unset.
2. Run `pnpm --filter @workspace/api-server run ai:verify-astra` in the Replit environment that has its AI gateway bound. It makes two small generation requests using synthetic data; these may incur provider charges, but it sends no emails, creates no search jobs, and changes no prospect records.
3. The command must pass Chat Completions with medium reasoning, JSON output, returned model identity, and Responses with medium reasoning, completed web search, a matching official citation, and the current shortest research timeout. It prints timing and token usage plus a synthetic draft for tone review; it never prints credentials.
4. Only after it passes, set `OPENAI_ASTRA_ENABLED=true` in Replit development, restart the API, and run the staging checks below. The two-call probe does not prove production performance or every task's behavior.
5. Enable the flag separately for the published runtime only after staging validation and a deliberate deployment decision. Without it, the previous models remain selected. Unset the flag and restart to roll back model selection while retaining the tone improvements.

If the command fails, leave the flag unset. Do not guess another model identifier, silently substitute a different model, disable web-search checks, or claim that Astra is live. This Codex environment has no AI gateway credentials; availability must be checked from Replit.

Before enabling Astra for production:

1. Confirm the existing Replit AI integration supports `gpt-6-astra` on both
   `/chat/completions` and `/responses`, with medium reasoning and web search.
   Do not paste API keys into chat, logs, or repository files.
2. In staging, generate a prospect email, a reusable campaign template, and a
   follow-up without sending them. Check enthusiastic natural tone, factuality,
   JSON parsing, completeness, relevance scoring, latency, and token usage.
3. Run company and opportunity research on known public businesses; verify source
   URLs, company matching, complete structured results, and existing timeout limits.
4. Review per-request cost against the previous GPT-5.4/mini workload before
   enabling scheduled production generation. Unset `OPENAI_ASTRA_ENABLED` and restart to
   restore the previous per-workload model selection and budgets if required.

No production credentials were available during preparation, and no live model
availability or deployment is claimed.

The model identifier is the requested migration target, not a claim of provider availability. Use the configured provider's current documentation and the live compatibility command as evidence; local mocked tests do not verify a public model listing.
