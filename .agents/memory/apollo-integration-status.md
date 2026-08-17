---
name: Apollo integration status
description: Apollo API is live; search uses new api_search two-step flow
---

Apollo enrichment is LIVE (user upgraded to paid plan and issued a properly-scoped API key, Aug 2026).

- Old `mixed_people/search` endpoint is deprecated for API callers → code uses `mixed_people/api_search`.
- **Why two steps:** `api_search` returns obfuscated people (no email, `last_name_obfuscated`, `has_*` flags only). The chosen candidate must be enriched via `people/match` with `{ id, reveal_personal_emails: false }` to reveal name/title/email/LinkedIn.
- `people/match` may still return `email: null` when Apollo has no verified email — treat as "not found", not an error.
- A 403 `API_INACCESSIBLE` means the key's endpoint *scope* excludes that endpoint (not necessarily a free plan) — user must edit the key in Apollo settings or make it a master key.
