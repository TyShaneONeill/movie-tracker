# Acquisition Attribution — Analytics Contract

Board attribution mandate, shipped ahead of the Product Hunt launch (Aug 8,
2026). This doc is the consumption contract for the growth digest — event
names and properties are stable; coordinate before renaming anything.

## Rollout gate

The entire prompt is gated on the PostHog feature flag **`acquisition_prompt`**
(`useAcquisitionPromptGate` in `hooks/use-feature-flag.ts`; dev override
`EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE`). The gate reports `resolved` and
`resolution` alongside `enabled`, so an unresolved flag means WAIT, not off —
this prompt targets a user's first session, which is exactly when PostHog has
not answered yet. Fails closed once resolved: no prompt and no profile query.
`resolution` distinguishes a real answer (`flag`, `override`) from the backstop
timeout giving up on one (`backstop`), which is what keeps the `flag_off` /
`flag_unresolved` reasons below honest. Founder validation:
`account_tier = 'dev'` profiles bypass the `created_at` cutoff only (all other
gates apply), so pre-cutoff founder accounts can test on device before the flag
widens.

**Delivery**: the prompt is a first-run surface, so it only reaches a user whose
binary already contains it — the embedded bundle runs on first launch, before
any OTA applies. Shipping it by OTA alone leaves it dark for exactly the cohort
it targets.

## PostHog events

| Event | Properties | Fired when |
|---|---|---|
| `acquisition:prompt_shown` | — | The one-time first-run "what brought you here?" sheet becomes visible on Home. |
| `acquisition:source_selected` | `source`: `producthunt` \| `alternativeto` \| `x` \| `friend` \| `search` \| `other` | User taps a source chip. Fires exactly once per user (the prompt never re-shows). |
| `acquisition:prompt_dismissed` | — | User skips/dismisses without answering. Also terminal — the prompt never re-shows. |
| `acquisition:gate_evaluated` | `reason` (see below) | A launch evaluated the gate and did NOT get the prompt. Deduped to once per reason per app session. |

`gate_evaluated` is the diagnostic channel: a dark prompt should be answerable
from this one event rather than inferred from `$feature_flag_called` volume.

| `reason` | Meaning |
|---|---|
| `flag_off` | PostHog answered; the flag is off for this user. |
| `flag_unresolved` | PostHog **never** answered and the 5s backstop gave up — offline or a failed init. Not the same as off, and the reason this pair is split: the offline first launch is precisely what this event exists to catch. |
| `already_shown` | The local latch is set. Paired with an empty `profiles.acquisition_source`, this means an answer was lost in transit. |
| `already_answered` | `profiles.acquisition_source` is non-null — the healthy terminal state. Every returning user lands here. |
| `not_onboarded` | Onboarding has not completed. |
| `pre_cutoff` | Existing user (profile predates `ATTRIBUTION_CUTOFF_ISO`), or a missing/unparseable `created_at`, which fails closed the same way. |
| `lost_focus` | Home lost focus inside the 600ms show delay, usually the post-onboarding route handoff. |

Silence is also information, but it means less than it looks like. Three cases
emit no `gate_evaluated` at all: the gate never ran (signed out, or Home never
focused), the flag is still pending (we are waiting, not refusing), and the
profile read failed (that path raises to Sentry under
`acquisition-prompt-profile-read` — a broken DB is not a gating decision).
**A backstop-resolved launch is not one of them: it emits `flag_unresolved`.**

On `source_selected` the source is also mirrored to the PostHog person as the
`acquisition_source` person property (via `setPersonProperties`), so cohorts
can be built without event joins.

## Once-ever latching

The local AsyncStorage latch (`acquisition.prompt_shown`) is written when the
user ANSWERS — taps a chip or skips — not when the sheet appears. An impression
nobody answered (backgrounded, force-quit) must not burn the single ask.
Accepted trade: force-quitting while the sheet is up means one more ask next
launch. `profiles.acquisition_source` remains the durable once-ever guard, so a
user who actually answered is never re-asked, reinstall included.

## Profile persistence

`profiles.acquisition_source text` (migration
`supabase/migrations/20260804090000_profiles_acquisition_source.sql`):

- One of the six source values above, or `skipped` (dismissed without
  answering), or `NULL` (never prompted — all pre-cutoff users).
- Any non-null value doubles as the reinstall-surviving "seen" flag: the
  prompt is gated on this column, not just local storage.
- Existing users are additionally excluded by a `created_at` cutoff
  (`ATTRIBUTION_CUTOFF_ISO` in `lib/acquisition-service.ts`).

## Library adds — `movie:library_add`

`addMovieToLibrary` (`lib/movie-service.ts`) is the **sole client write path for
`user_movies`**, onboarding's watchlist seeding included, and it emitted nothing
at all. That made a whole signup cohort look dead and left the daily board
digest structurally blind to onboarding-seeded adds.

| Event | Properties | Fired when |
|---|---|---|
| `movie:library_add` | `source`: `onboarding` \| `search` \| `scan` \| `import` \| `unknown`; `status`; `tmdb_id` | Any successful `user_movies` write from the client. |

Tracked inside the service rather than at each caller, so a new call site cannot
go dark. `source` is an optional `options.source`; the call sites wired so far
are onboarding v2 seeding (`onboarding`), the in-app add paths in
`use-movie-actions` / `use-user-movies` (`search`), scan save and scan review
(`scan`), and the Letterboxd import (`import`). The release-calendar add is
deliberately left at `unknown` — none of the current values describe it, and
labelling it `search` would pollute that number. **`unknown` means untagged, not
untracked.**

Properties match `movie:watchlist_add` practice: ids and counts, no title.

**Follow-up — issue #824 (not in this change):**
`supabase/functions/post-daily-metrics` should add `movie:library_add` to its
`ENGAGED_EVENTS` list (`index.ts:24,191`) once the event exists in prod data.
That is the actual fix for the digest blindness and it needs its own deploy —
this event landing on the client does not, by itself, un-blind the digest.

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
