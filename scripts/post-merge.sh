#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply safe additive schema changes (new nullable/defaulted columns) to the
# dev DB so merged tasks that touch lib/db/src/schema don't leave it drifted.
# Non-interactive by design (drizzle-kit push prompts and would hang here).
pnpm --filter @workspace/db run ensure-columns
