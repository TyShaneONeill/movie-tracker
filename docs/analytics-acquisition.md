# Acquisition Attribution — Analytics Contract

Board attribution mandate, shipped ahead of the Product Hunt launch (Aug 8,
2026). This doc is the consumption contract for the growth digest — event
names and properties are stable; coordinate before renaming anything.

## Rollout gate

The entire prompt is gated on the PostHog feature flag **`acquisition_prompt`**
(`useAcquisitionPromptEnabled` in `hooks/use-feature-flag.ts`; dev override
`EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE`). Fails closed — flag off/loading
means no prompt and no profile query. Founder validation: `account_tier =
'dev'` profiles bypass the `created_at` cutoff only (all other gates apply),
so pre-cutoff founder accounts can test on device before the flag widens.

## PostHog events

| Event | Properties | Fired when |
|---|---|---|
| `acquisition:prompt_shown` | — | The one-time first-run "what brought you here?" sheet becomes visible on Home. |
| `acquisition:source_selected` | `source`: `producthunt` \| `alternativeto` \| `x` \| `friend` \| `search` \| `other` | User taps a source chip. Fires exactly once per user (the prompt never re-shows). |
| `acquisition:prompt_dismissed` | — | User skips/dismisses without answering. Also terminal — the prompt never re-shows. |

On `source_selected` the source is also mirrored to the PostHog person as the
`acquisition_source` person property (via `setPersonProperties`), so cohorts
can be built without event joins.

## Profile persistence

`profiles.acquisition_source text` (migration
`supabase/migrations/20260804090000_profiles_acquisition_source.sql`):

- One of the six source values above, or `skipped` (dismissed without
  answering), or `NULL` (never prompted — all pre-cutoff users).
- Any non-null value doubles as the reinstall-surviving "seen" flag: the
  prompt is gated on this column, not just local storage.
- Existing users are additionally excluded by a `created_at` cutoff
  (`ATTRIBUTION_CUTOFF_ISO` in `lib/acquisition-service.ts`).

## Web funnel store-link tagging (public/ pages, Vercel static)

Outbound store links on `welcome.html`, `landing.html`, `tv-time-import.html`
(plus static-only tags on `about.html`, `reset-password.html`):

- **Apple**: `?ct=<source>` campaign token. No `pt=` provider token is
  configured yet (none existed in the repo) — ct-only until a provider token
  is added from App Store Connect, so ASC campaign reporting is limited until
  then.
- **Play**: `&referrer=utm_source%3D<source>` install referrer. Reading it
  in-app needs the native Play Install Referrer API — out of OTA scope,
  future-build item.

Values: `producthunt`, `alternativeto`, `x`, `web-organic` (static default).
Funnel pages carry an inline script that promotes an inbound
`?utm_source=`/`?ref=`/`?src=` (aliases: `product-hunt`, `product_hunt`,
`ph` → `producthunt`; `twitter`, `x.com` → `x`) onto the store links; anything
unrecognized keeps the `web-organic` default.

Campaign links to hand out: `https://pocketstubs.com/welcome?utm_source=producthunt`
(and `alternativeto` / `x` variants) — the page does the rest.
