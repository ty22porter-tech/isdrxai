---
name: Stale lib dist after codegen
description: Generated API client libs can have stale dist declarations after orval regen; force-rebuild fixes phantom type errors.
---
Rule: when an artifact's typecheck says a generated API type is missing a field that clearly exists in the OpenAPI spec and in lib src/generated, suspect a stale compiled `dist/` in the lib (e.g. lib/api-client-react), not the spec.

**Why:** `tsc --build` incremental state (tsconfig.tsbuildinfo) can skip rebuilding after orval rewrites src, so consumers resolving dist declarations see old types (e.g. BulkProspectsInput.duplicateStrategy, BulkProspectsResult.updated missing).

**How to apply:** run `npx tsc --build --force` inside the lib, then re-run the artifact typecheck. Check `dist/generated/*.d.ts` for the field to confirm. dist is git-ignored, so each environment must rebuild its own.

Use the same Zod import family as the generated schema when inferring its type; generated API schemas use the root `zod` import, while some handwritten schemas use `zod/v4`.

**Why:** Inferring a generated root-Zod schema through `zod/v4` produced `unknown` despite a valid object schema. Both API families coexist in this workspace.

**How to apply:** Match imports for type inference instead of duplicating the contract or casting the result to hide the incompatibility.
