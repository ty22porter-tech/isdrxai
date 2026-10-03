---
name: Branding / rebrand sweep locations
description: Where user-visible brand strings hide when rebranding this multi-artifact workspace, and the Stripe live-product caveat
---

# Rebrand sweep — non-obvious locations

## Product audience

iSDRX AI is for companies across all industries, including technology—not exclusively janitorial businesses or trades.

**Why:** The user explicitly clarified that the Features messaging must include tech companies and must not position the product as trades-only.

**How to apply:** Use industry-inclusive wording on general marketing and Features surfaces. Avoid janitorial-specific general positioning or claims that exclude technology companies.

When rebranding this workspace (current brand: **iSDRX AI**), a plain `rg "OldBrand"` over `src/` is not enough. User-visible brand strings also live in:

- **Artifact titles**: `artifacts/<slug>/.replit-artifact/artifact.toml` → `title = "..."`. This is a **hidden** dir, so `artifacts/*/artifact.toml` globs miss it. These titles are shown to the user. Edit them ONLY via the `verifyAndReplaceArtifactToml` callback (write a full `artifact.edit.toml` sibling, then replace) — never edit `artifact.toml` in place.
- `index.html` `<title>` + meta description/OG tags in every artifact.
- Video scene text (e.g. brand reveal / close scenes) — plain JSX strings, easy to miss.
- `lib/api-spec/openapi.yaml` `description`. After editing, rerun `pnpm --filter @workspace/api-spec run codegen` (regenerates api-zod + api-client-react).
- Your own `.agents/memory/*.md` topic files may reference the old brand — sweep `--hidden` to catch them.

**Why:** the initial rebrand pass missed the `.replit-artifact` titles precisely because the dir is hidden; a `--hidden` full-repo `rg` is the reliable final check.

## Plan names are coupled across 3 places (rename in lockstep)
Live Stripe product names, `TIERS[].productName` in pricing.tsx, and the api-server SUBSCRIPTION_PLAN_NAMES whitelist must all match EXACTLY — checkout looks up prices by `product.name`. Current names (renamed via Stripe API July 2026): "iSDRX AI Starter" / "iSDRX AI" / "iSDRX AI Growth". Any future rename must update all three in one release; renaming the Stripe product is safe for existing subscriptions (they reference product IDs). Local `stripe.products` table re-syncs via webhook/startup backfill.

## Stripe live-product rename caveat
Changing the product name in `artifacts/api-server/src/seed-products.ts` does NOT rename the already-created live Stripe product. Seeding matches/creates by name, so a new name creates a **second** product lineage rather than renaming the old one. To rebrand the live product the user must rename it in the Stripe dashboard/API (or map old→new IDs explicitly). Flag this to the user; do not silently reseed.
