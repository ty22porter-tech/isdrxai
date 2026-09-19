---
name: Apollo integration status
description: Apollo API is live; search uses new api_search two-step flow
---

Apollo enrichment is LIVE (user upgraded to paid plan and issued a properly-scoped API key, Aug 2026).

- Old `mixed_people/search` endpoint is deprecated for API callers → code uses `mixed_people/api_search`.
- **Why two steps:** `api_search` returns obfuscated people (no email, `last_name_obfuscated`, `has_*` flags only). The chosen candidate must be enriched via `people/match` with `{ id, reveal_personal_emails: false }` to reveal name/title/email/LinkedIn.
- `people/match` may still return `email: null` when Apollo has no verified email — treat as "not found", not an error.
- **Wrong-contact policy:** a wrong contact is worse than no contact. Fuzzy name search can return people from unrelated companies, so any Apollo match must pass a plausibility gate (domain agreement wins; a conflicting org domain rejects even with name resemblance; name evidence only when no reliable domain). Rejections surface as "not found", never a wrong contact.
- **api_search silently ignores unknown filter params** (no error): `organization_domains` is wrong and returns people from random companies worldwide; the correct filter is `q_organization_domains_list`. Any new filter param must be curl-verified against the live API — never trust a 200 response as proof the filter applied.
- A 403 `API_INACCESSIBLE` means the key's endpoint *scope* excludes that endpoint (not necessarily a free plan) — user must edit the key in Apollo settings or make it a master key.

- Keep search batch capacity and automatic enrichment request capacity aligned.
  **Why:** A larger search succeeded while the separate enrichment validator rejected its result list before contacting Apollo; the UI misleadingly reported contact lookup unavailable.
  **How to apply:** Test the maximum search-sized batch against the enrichment endpoint, including generated request validation. Diagnose server validation errors before attributing this label to Apollo credentials or missing contacts.
