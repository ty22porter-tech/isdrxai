#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply safe additive schema changes (new nullable/defaulted columns) to the
# dev DB so merged tasks that touch lib/db/src/schema don't leave it drifted.
# Also detects column TYPE CHANGES and probable RENAMES, which cannot be
# auto-fixed and fail the check below.
# Non-interactive by design (drizzle-kit push prompts and would hang here).
# Fails loudly (non-zero exit) if drift remains that the guard cannot fix —
# do NOT publish until this passes, or prod will be missing columns/tables.
if ! pnpm --filter @workspace/db run ensure-columns; then
  echo "" >&2
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
  echo "!! SCHEMA DRIFT: dev database does not match the Drizzle schema.  !!" >&2
  echo "!! The schema guard could not fix it automatically.               !!" >&2
  echo "!! (missing columns/tables, changed column types, or renames).    !!" >&2
  echo "!! Fix manually (see lib/db/README.md) BEFORE publishing,         !!" >&2
  echo "!! or the live app will break on the drifted columns/tables.      !!" >&2
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
  exit 1
fi
