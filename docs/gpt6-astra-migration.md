# GPT-6 Astra medium migration

The OpenAI text generation and web-research requests now use `gpt-6-astra`
with explicit medium reasoning. Shared settings live in
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
- Plain-text calls retain Chat Completions with `reasoning_effort: "medium"`.
- Web-search calls retain Responses with `reasoning: { effort: "medium" }`.
- Existing web-search tools, source validation, JSON contracts, relevance checks,
  contact enrichment, and send/approval rules remain in place.
- Existing Gemini fallback routing and specialized image/audio models are unchanged.
- Existing visible-answer token budgets gain 8,192 tokens of reasoning headroom.
  Prompt word limits still govern email length. This allowance is an initial budget,
  not a guarantee against truncation; validate real outputs before production.

This upgrades calls previously using GPT-5.4 **and** GPT-5.4-mini. Research no
longer uses the cheaper mini model. Measure actual cost and latency, especially
on research requests with short timeouts, before deploying.

## Validation and release status

Local validation uses mocked model responses and synthetic credentials. Passing
tests validates application request/response contracts, not Astra's writing quality
or access through the deployed Replit model gateway.

Before merging/deploying:

1. Confirm the existing Replit AI integration supports `gpt-6-astra` on both
   `/chat/completions` and `/responses`, with medium reasoning and web search.
   Do not paste API keys into chat, logs, or repository files.
2. In staging, generate a prospect email, a reusable campaign template, and a
   follow-up without sending them. Check enthusiastic natural tone, factuality,
   JSON parsing, completeness, relevance scoring, latency, and token usage.
3. Run company and opportunity research on known public businesses; verify source
   URLs, company matching, complete structured results, and existing timeout limits.
4. Review per-request cost against the previous GPT-5.4/mini workload before
   enabling scheduled production generation. Revert this migration commit to
   restore the previous per-workload model selection and budgets if required.

No production credentials were available during preparation, and no live model
availability or deployment is claimed.

Official compatibility reference:
https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md
