---
name: Frontend manual builds
description: Required environment when manually validating the ai-sdr production bundle.
---

Run the ai-sdr production build with both a valid `PORT` and `BASE_PATH=/app/`; invoking the package build script without the workflow environment fails while loading Vite configuration.

**Why:** The Vite configuration intentionally fails closed when either routing value is absent, so a bare package build produces environment errors unrelated to the code being validated.

**How to apply:** For manual build verification outside the managed workflow, provide an unused positive port and the `/app/` base path. Do not weaken the Vite validation to make ad hoc builds pass.