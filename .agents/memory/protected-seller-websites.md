---
name: Protected seller websites
description: Handling public company websites that deny production crawler traffic while remaining readable elsewhere.
---

Public company sites may return HTTP 403 or 429 specifically to production datacenter traffic even when the same request succeeds in development.

**Why:** Treating that difference as an invalid website prevents legitimate Company Intelligence updates and leaves users with a generic failure.

**How to apply:** Keep DNS/public-address validation and bounded response reads on every direct crawl. For 403/429 only, use the fixed, redirect-rejecting public reader fallback; never weaken SSRF checks or silently use a prior company's facts.