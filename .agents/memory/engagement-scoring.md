---
name: Engagement scoring & repeated-open follow-up
description: How interest scoring, the 3rd-open meeting-request automation, and Hot alerts fit together; invariants to keep.
---

- Engagement scoring must stay event-log-authoritative and lock-serialized per prospect: score = sum of `score_events`, computed inside one transaction under `pg_advisory_xact_lock` before touching the cached prospect columns.
- **Why:** concurrent events (open + click landing together) otherwise lose points via read-modify-write races, misfire the exactly-once Hot alert, and miscount the 3rd-open trigger. Was a completion-review rejection once.
- **How to apply:** any new scoring entry point must call `recordEngagementEvent` (never write the cached score directly); it swallows errors by design so public tracking endpoints can't break.
- pg advisory lock keys are int4 pairs — a key >2^31-1 silently fails the whole locked transaction (surfaced only in logs). Keep app lock namespaces small.
- `campaigns.follow_up_mode` (Option A/B for the repeated-open follow-up) bypasses the orval-generated zod schema: PATCH route reads it manually from req.body, frontend sends plain fetch. Regenerating the API client won't cover it unless openapi.yaml is updated.
- Testing valid opens quickly: dedup keys on email+IP+UA, so vary the User-Agent per hit; opens <15s after sent_at are discarded as prefetch.

**Bot filtering:** opens AND clicks share the same heuristics (scanner UA list, <15s-after-send prefetch window; clicks add a 10s different-link "click-burst" check). Bot events are still recorded (isBot+botReason) but never scored, never bump clickCount, and never create inferred opens. GoogleImageProxy is a real human open — never blocklist it.
