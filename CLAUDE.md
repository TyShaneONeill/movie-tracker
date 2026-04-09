# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cinetrak is a React Native mobile app (iOS, Android, Web) built with Expo and expo-router for file-based routing.

## Development Commands

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run in web browser
npm run lint       # Run ESLint
```

## Edge Function Deploy Commands

⚠️ **Always use these exact commands** — flags matter:

```bash
# scan-ticket MUST use --no-verify-jwt (Supabase CLI v2.84.2+ does not apply config.toml)
supabase functions deploy scan-ticket --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh

# All other functions (standard JWT verification via Supabase gateway)
supabase functions deploy <function-name> --project-ref wliblwulvsrfgqcnbzeh
```

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

## Git Workflow (REQUIRED)

**Never commit directly to `main`.** All work must go through PRs:

1. **Create a branch** before making changes:
   - `feature/*` - new features
   - `fix/*` - bug fixes
   - `chore/*` - maintenance, config, docs

2. **Commit and push** to the feature branch

3. **Create a PR** with `gh pr create`

4. **CI must pass** (lint + TypeScript) before merging

5. **Merge via GitHub** - PRs to main

```bash
# Example workflow
git checkout main && git pull
git checkout -b feature/my-feature
# ... make changes ...
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
3. The settings screen reads the version dynamically from `expo-constants` — no other files need changing

## Ad Network Architecture

- **AdMob** (`react-native-google-mobile-ads`) — iOS + Android apps only. Supports banner, native, rewarded ads.
- **AdSense** — Web only (`pocketstubs.com`). Banner/display only, no rewarded ads.
- Ad unit IDs live in `components/ads/banner-ad.tsx`, `components/ads/native-feed-ad.tsx`, `hooks/use-rewarded-ad.ts`
- `app-ads.txt` at `public/app-ads.txt` → deployed to `pocketstubs.com/app-ads.txt` for AdMob verification
- `ads.txt` at root → deployed to `pocketstubs.com/ads.txt` for AdSense

## Key Resources

- **PRD**: `docs/PRD-pre-launch.md` - Pre-launch checklist and requirements
- **Supabase Project**: `wliblwulvsrfgqcnbzeh`
- **GitHub Repo**: https://github.com/TyShaneONeill/movie-tracker
