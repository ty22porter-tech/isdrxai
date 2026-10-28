---
name: Authenticated browser test interception
description: Avoid false authentication failures when testing private API response states with the browser helper.
---

Preserve the testing helper's authentication handling when intercepting private API responses.

**Why:** A custom Playwright route.fetch interception of the profile endpoint produced 401 responses and misleading access warnings, while an ordinary authenticated browser fetch returned 200 for the same QA account. Transforming the successful browser response instead allowed the intended UI-state test without changing authentication or account data.

**How to apply:** Establish that the normal authenticated request succeeds before simulating a response. Keep the helper's auth routes intact; when necessary, transform the response after the ordinary browser fetch completes. Do not treat an interception-only 401 as evidence that application authentication or trial entitlement needs changing.
