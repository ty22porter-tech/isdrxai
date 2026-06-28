---
name: DB package rebuild pattern
description: lib/db uses TypeScript project references; must rebuild declarations after schema changes
---

## Rule
After any schema change in `lib/db/src/schema/`, run:
```
cd lib/db && pnpm exec tsc -p tsconfig.json
```
This regenerates `lib/db/dist/*.d.ts` declaration files. Without this, consuming packages (api-server, etc.) will get TS2305 errors like "Module '@workspace/db' has no exported member 'X'".

## Why
`lib/db/tsconfig.json` has `"composite": true` and `"emitDeclarationOnly": true`. The api-server's tsconfig uses `"references": [{ "path": "../../lib/db" }]` which makes tsc resolve via the dist/ folder, not src/.

Esbuild (used for the actual server build) resolves via the `exports` field in package.json which points to `./src/index.ts`, so the runtime always works — only tsc type-checking is affected.

**Why:** Project references enable incremental builds across packages but require the dist/declarations to be in sync with source.

**How to apply:** Any time you edit lib/db/src/schema/ files and see TS2305 errors in other packages, rebuild lib/db first.
