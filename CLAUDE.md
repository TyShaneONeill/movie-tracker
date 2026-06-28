# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cinetrak is a React Native mobile app (iOS, Android, Web) built with Expo and expo-router for file-based routing.

## Judgment calls

When you hit an ambiguous decision this file and the task brief don't settle — quick fix vs real feature, ship now vs harden first, is this audit finding actually real, which approach fits — read `~/OPINIONS.md` if it's present and resolve it the way the owner would. It's a living map of his taste, consistent tradeoffs, and judgment (distinct from these instructions, which are *how* to work, not *what he believes*). It's optional context: if the file isn't there (e.g. a cloud/CI session), proceed with the conventions in this file.

## First-time setup

See [`docs/operations/dev-environment-setup.md`](docs/operations/dev-environment-setup.md) — covers prerequisites (Node, Xcode, Homebrew), Doppler binding, gitleaks pre-commit hook, and account access requests.

## Development Commands

These wrap with `doppler run --` automatically (env vars come from Doppler, not `.env.local`). If they fail with `doppler: not found` or `Could not find requested project`, you haven't completed the setup linked above.

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run in web browser
npm run lint       # Run ESLint (no Doppler needed)
npm test           # Run Jest unit tests (no Doppler needed)
```

## Edge Function Deploy Commands

⚠️ **Always use these exact commands** — flags matter:

```bash
# Functions invoked from anonymous / pre-auth contexts MUST use --no-verify-jwt.
# The caller carries no valid session JWT, so without this flag the Supabase
# gateway rejects the request and the client sees "Edge Function returned a
# non-2xx status code". (Supabase CLI v2.84.2+ does not apply config.toml.)
#
#   - scan-ticket          (called during onboarding, pre-auth)
#   - get-tv-show-details  (anonymous web visitors on /tv/{id} share links)
#   - get-season-episodes  (same public TMDB-passthrough path)
supabase functions deploy scan-ticket --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh
supabase functions deploy get-tv-show-details --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh
supabase functions deploy get-season-episodes --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh

# All other functions (standard JWT verification via Supabase gateway)
supabase functions deploy <function-name> --project-ref wliblwulvsrfgqcnbzeh
```

> Each function's own header comment is the source of truth for its deploy
> flags — check it before deploying. The list above covers the public
> TMDB-passthrough functions; cron functions (e.g. `send-*-reminders`) have
> their own auth model documented in `_shared/cron-auth.ts`.

## Tech Stack

- **Framework**: Expo ~54.0, React Native 0.81.5, React 19.1
- **Routing**: expo-router ~6.0 (file-based routing in `app/` directory)
- **Language**: TypeScript (strict mode)
- **Data Fetching**: TanStack Query (@tanstack/react-query)
- **Backend Client**: Supabase (@supabase/supabase-js)
- **Navigation**: React Navigation v7 (via expo-router)

## Project Structure

```
app/                    # File-based routing (expo-router)
├── _layout.tsx         # Root layout
├── (tabs)/             # Tab navigator group
│   ├── _layout.tsx     # Tab layout configuration
│   └── index.tsx       # Home tab
├── modal.tsx           # Modal screen
components/             # Reusable UI components
constants/              # App constants (colors, etc.)
hooks/                  # Custom React hooks
assets/                 # Images, fonts
```

## Routing Conventions

- Files in `app/` become routes automatically
- `_layout.tsx` files define layouts for their directory
- Parentheses `(tabs)` create route groups without affecting URL
- Dynamic routes use brackets: `[id].tsx`
- Typed routes enabled via `experiments.typedRoutes` in app.json

## UI Changes (REQUIRED)

When making UI changes, always check **all screen components that share the same pattern** — e.g., `journey/[id].tsx`, `journey/movie/[tmdbId].tsx`, and similar dynamic route siblings. Never assume a fix or style change applies to only one file. Search for files with the same structure and apply changes consistently.

## Git Workflow (REQUIRED)

**Never commit directly to `main`.** All work must go through PRs:

1. **Verify your branch** before any git operation — run `git branch --show-current` first. Never commit or create a PR without confirming you're on the correct branch.

2. **Create a branch** before making changes:
   - `feature/*` - new features
   - `fix/*` - bug fixes
   - `chore/*` - maintenance, config, docs

3. **Commit and push** to the feature branch

4. **Create a PR** with `gh pr create`

5. **CI must pass** (lint + TypeScript) before merging

6. **Merge via GitHub** - PRs to main

**Before every commit:**
- Run `npx tsc --noEmit` and `npm run lint` — fix all errors before committing
- Run `git status` to verify all modified files are staged before pushing

```bash
# Example workflow
git branch --show-current   # Verify correct branch
git checkout main && git pull
git checkout -b feature/my-feature
# ... make changes ...
npm run lint && npx tsc --noEmit   # Must pass
git status                         # Verify staged files
git add -A && git commit -m "feat: description"
git push -u origin feature/my-feature
gh pr create --title "feat: description" --body "Summary..."
```

## Agentic Workflow (REQUIRED)

**You are an orchestrator, not a worker.** Follow these principles:

1. **Delegate to agents** - Use the `Task` tool to spawn agents for:
   - Exploring/searching the codebase
   - Fixing bugs or implementing features
   - Debugging issues
   - Any task requiring multiple file reads/edits

2. **Keep context lean** - Don't read every file yourself; let agents do the investigation

3. **Parallelize when possible** - Spawn multiple agents for independent tasks

4. **Verify agent work** - Run `npm run lint && npx tsc --noEmit` after agent changes

5. **Commit incrementally** - Small, focused commits on feature branches

## Versioning

PocketStubs uses semantic versioning. **Do NOT bump the version with every PR.** Version bumps happen intentionally before an App Store release.

| Change | Version bump | Example |
|--------|-------------|---------|
| Bug fix, config, copy | `1.0.x` patch | `1.0.0 → 1.0.1` |
| New feature, meaningful UX change | `1.x.0` minor | `1.0.0 → 1.1.0` |
| Major product overhaul | `x.0.0` major | `1.x.x → 2.0.0` |

**When bumping a version** (only when explicitly instructed):
1. Update `version` in `app.config.js`
2. Update `version` in `package.json` to match
3. Bump `ios.buildNumber` in `app.config.js` (App Store rejects duplicate build numbers within a version train)
4. Bump `android.versionCode` in `app.config.js` (Play Store rejects duplicate version codes)
5. Bump `runtimeVersion` in `app.config.js` to match the new `version` — OTAs only serve to matching native shells, so a new native release needs a new runtimeVersion
6. The settings screen reads the version dynamically from `expo-constants` — no other JS files need changing

**Native directory trap (1.4.0 release gotcha):** `/ios` and `/android` are gitignored, but `npm run ios` / `npm run android` / `expo prebuild` generate them locally as a side effect. When EAS Build compresses your project for upload, it sees those local prebuilt dirs and **switches to bare workflow**, silently ignoring version fields in `app.config.js` in favor of `ios/<Project>/Info.plist` (`CFBundleShortVersionString`, `CFBundleVersion`) and `android/app/build.gradle` (`versionName`, `versionCode`). Watch for this warning in EAS output:

```
Specified value for "ios.bundleIdentifier" in app.config.js is ignored because an ios directory was detected in the project.
```

If you see it, your build's version numbers are coming from stale native files, not from `app.config.js`. Fix: `rm -rf ios/ android/ && git restore ios/sentry.properties` before rebuilding, so EAS prebuilds fresh from `app.config.js` in the cloud.

## Database / Supabase

**All schema changes MUST be authored as committed `.sql` files in `supabase/migrations/`** before being pushed to any remote DB. Author new migrations with `supabase migration new <name>`, edit the generated file, verify locally with `supabase db reset` or `supabase migration up`, then push via `supabase db push` after PR review.

**The `mcp__plugin_supabase_supabase__apply_migration` MCP tool is banned for schema changes.** Using it to apply DDL without a corresponding committed file is what caused the April–May 2026 drift that required the baseline cleanup. The tool may only be used for read-only diagnostics or emergency hotfixes that are immediately back-filled into a real migration file.

`supabase/migrations-archive/` holds the previous (incomplete) migration history for historical reference; Supabase tooling does not look there.

See [`docs/supabase-migration-workflow.md`](docs/supabase-migration-workflow.md) for the full workflow and history.

## Environments — Dev/Staging/Prod Parity (REQUIRED)

We are **live on iOS, Android, and web.** As of June 2026 there is a dedicated
**staging** environment so we never test against prod data again. The standing
rule: **develop and validate on staging first; touch prod only once a change is
tested and you're comfortable to merge.** Keep the two environments as similar
as possible, and when feasible validate on both.

| Doppler config | Supabase project | EAS env | Use |
|---|---|---|---|
| `prd` | `wliblwulvsrfgqcnbzeh` (cinetrak) | production | live apps — **only after staging-validated** |
| `stg` | `scleidoemjpkbxrpyqyv` (pocketstubs-staging) | preview | day-to-day dev, QA, agent testing |
| `dev` | local supabase | development | fast local iteration |

**Rules of engagement:**
- **Default to staging.** Point builds/scripts at `stg` while developing. Promote to `prd` only when validated.
- **Migrations:** apply to **staging first** (`supabase db push` linked to staging), verify behavior, *then* prod. Schema changes still must be committed `.sql` files (see Database section).
- **Edge functions:** deploy to staging and test before prod. Keep parity — if you add/change a function, it must exist on both.
- **Keep staging in sync with prod:** when migrations or functions land on `main`, refresh staging with `scripts/setup-staging.sh` so parity doesn't drift.
- **Validate on both when possible** before calling a change done — especially anything touching auth, RLS, migrations, or edge functions.

**Pointing a local build at staging** (e.g. for device/agent QA):
- Custom native modules (`WidgetBridgeModule`) mean **Expo Go does not work** — you must use a **dev-client** build (`npx expo start --dev-client`, or `npx expo run:ios` to build one).
- Supply staging env via `.env.local` written from Doppler `stg`
  (`doppler secrets download --no-file --format env --config stg | grep '^EXPO_PUBLIC_' > .env.local`),
  or run under `doppler run --config stg -- …`. Note `lib/supabase.ts` reads
  `Constants.expoConfig.extra` (set from `EXPO_PUBLIC_*` in `app.config.js`) with
  a `process.env` fallback — a baked standalone build will ignore `.env.local`.
- Staging QA user: `qa@pocketstubs.app` (password in Doppler `stg` → `QA_TEST_PASSWORD`).
- Provisioning + full runbook: see the vault note `Projects/PocketStubs/Process/Staging Environment Setup`.

**Known parity gaps to fix (do not assume staging == prod yet):**
- Some edge functions exist **only on prod, not in source** (e.g. `discover-movies`, `get-movie-lists`, `get-movie-details`, `search-movies`) — audit and commit them.
- The baseline migration (`20260525063629_remote_schema.sql`) is a prod schema snapshot with **hardcoded prod functions URLs** in webhook triggers; staging stubs them inert.
- Staging's RevenueCat/Stripe/PostHog still use prod values — swap to sandbox/staging before testing billing or analytics there.

## Ad Network Architecture

- **AdMob** (`react-native-google-mobile-ads`) — iOS + Android apps only. Supports banner, native, rewarded ads.
- **AdSense** — Web only (`pocketstubs.com`). Banner/display only, no rewarded ads.
- Ad unit IDs live in `components/ads/banner-ad.tsx`, `components/ads/native-feed-ad.tsx`, `hooks/use-rewarded-ad.ts`
- `app-ads.txt` at `public/app-ads.txt` → deployed to `pocketstubs.com/app-ads.txt` for AdMob verification
- `ads.txt` at root → deployed to `pocketstubs.com/ads.txt` for AdSense

## Key Resources

- **PRD**: `docs/PRD-pre-launch.md` - Pre-launch checklist and requirements
- **Supabase Project (prod)**: `wliblwulvsrfgqcnbzeh` (cinetrak)
- **Supabase Project (staging)**: `scleidoemjpkbxrpyqyv` (pocketstubs-staging) — see Environments section
- **GitHub Repo**: https://github.com/TyShaneONeill/movie-tracker
