---
name: Date query parameters
description: Reliable OpenAPI and UI handling for date-only query filters in this workspace.
---

Define date-only OpenAPI query parameters as `YYYY-MM-DD` strings with a pattern rather than `format: date`.

**Why:** The current Orval/Zod generator maps `format: date` to a JavaScript `Date` validator, but Express query parameters arrive as strings. Native date inputs can also emit transient malformed year values while users edit individual date segments.

**How to apply:** Keep the generated query contract string-based, debounce date-filter requests until the input is a complete valid calendar date, and use safe server-side parsing with inclusive day-boundary logic. Malformed direct requests should return a controlled 400 rather than becoming unhandled validation errors.