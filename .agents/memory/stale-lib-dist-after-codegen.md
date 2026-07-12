---
name: Stale lib dist after codegen
description: Generated API client libs can have stale dist declarations after orval regen; force-rebuild fixes phantom type errors.
---
Rule: when an artifact's typecheck says a generated API type is missing a field that clearly exists in the OpenAPI spec and in lib src/generated, suspect a stale compiled `dist/` in the lib (e.g. lib/api-client-react), not the spec.

**Why:** `tsc --build` incremental state (tsconfig.tsbuildinfo) can skip rebuilding after orval rewrites src, so consumers resolving dist declarations see old types (e.g. BulkProspectsInput.duplicateStrategy, BulkProspectsResult.updated missing).

**How to apply:** run `npx tsc --build --force` inside the lib, then re-run the artifact typecheck. Check `dist/generated/*.d.ts` for the field to confirm. dist is git-ignored, so each environment must rebuild its own.
