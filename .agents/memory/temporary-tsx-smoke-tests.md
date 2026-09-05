---
name: Temporary TypeScript smoke tests
description: Covers the workspace-specific runner needed for isolated TypeScript scripts.
---

Run temporary TypeScript smoke scripts through the database package's `tsx` command, not the API package, and wrap top-level async work in an async function when the script lives under `/tmp`.

**Why:** The API package does not expose `tsx`; the database package does. `/tmp` scripts compile as CommonJS here, so top-level `await` fails before the test runs.

**How to apply:** Use the database package as the runner, import workspace source by absolute path when necessary, wrap async entry points, and always clean temporary database records in `finally`.