# Development Environment Setup

This guide gets a fresh machine (or a new contributor) from a `git clone` to a working dev loop. **No secret values appear in this doc** — secrets live exclusively in Doppler. This document tells you *how* to fetch them and connect everything; you'll get the actual values from Doppler after you're invited to the workspace.

For the operational side of secrets management (rotating, adding new ones, incident response), see Tyshane's Evermind vault: `Workflows/Secrets Management Index.md` (ask for read access if you need it).

---

## Prerequisites

### System tooling

| Tool | Why | Install |
|---|---|---|
| **Node.js 20.x** | runtime + package manager | `brew install node@20` (or use nvm) |
| **Homebrew** | for installing Doppler + gitleaks | https://brew.sh/ |
| **Xcode** (latest stable) | iOS native builds | Mac App Store |
| **Android Studio** | Android native builds | https://developer.android.com/studio |
| **Doppler CLI** | secrets injection at runtime | `brew install dopplerhq/cli/doppler` |
| **gitleaks** | pre-commit secret scanner (required by hook) | `brew install gitleaks` |
| **GitHub CLI (`gh`)** | optional, makes PR workflow easier | `brew install gh` |

### Account access (request from Tyshane)

| Service | What you need |
|---|---|
| **GitHub** | Collaborator access on `TyShaneONeill/movie-tracker` |
| **Doppler** | Workspace invite — your auth grants you the secrets you need |
| **Expo / EAS** | Project access on `pocketstubs` for iOS/Android builds |
| **Vercel** | Team member access on `Ty ONeill's projects` for web deploys |
| **Supabase** | Project access on the production Supabase project (`wliblwulvsrfgqcnbzeh`) for edge function work |
| **Sentry** | Org access on `pocketstubs-5w` for error monitoring |
| **RevenueCat** | If you're touching subscription flows |
| **TMDB** | Free account — only needed if you want to test API queries directly |

You don't need every one of these on day one — Doppler + GitHub + Expo gets you running. Add the rest as your work touches each service.

---

## First-time setup (fresh clone)

```bash
# 1. Clone and enter the repo
git clone git@github.com:TyShaneONeill/movie-tracker.git cinetrak
cd cinetrak

# 2. Install dependencies (this also activates the husky pre-commit hook)
npm install

# 3. Verify husky activated
ls .husky/_/    # should show: applypatch-msg, commit-msg, pre-commit, etc.

# 4. Verify gitleaks is callable (the hook fails-closed without it)
gitleaks version    # should print a version, e.g. "v8.18.x"
```

If `npm install` doesn't activate husky, run `npx husky` once manually. If the `prepare` script is somehow skipped (e.g., `--ignore-scripts`), you'll need to run it explicitly.

---

## Connect to Doppler (the secrets layer)

```bash
# 1. Authenticate the Doppler CLI (opens browser)
doppler login

# 2. Bind this repo to the Doppler project + config
doppler setup --project pocketstubs --config dev --no-prompt

# 3. Verify the binding is active for this directory
doppler configure --scope .
# Should show project=pocketstubs, config=dev, and a token

# 4. Smoke test: confirm Doppler can inject env vars
doppler run -- node -e "console.log('ok:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'env injected' : 'MISSING')"
# Expected output: "ok: env injected"
```

**No `.env.local` file is needed.** All env vars come from Doppler at runtime. If you find a `.env.local` lying around in this repo, delete it — it's a stale artifact from before the Doppler migration (PR #421, 2026-05-02).

If `doppler run` fails with "Could not find requested project," you don't have access to the `pocketstubs` Doppler workspace yet — ask Tyshane for an invite.

---

## Verify the dev loop

```bash
# Web (fastest to verify, no native toolchain needed)
npm run web
# Should boot Expo at http://localhost:8081 with the web app rendered

# Lint + types (no env vars needed for these)
npm run lint
npx tsc --noEmit

# Unit tests (no env vars needed; jest mocks)
npm test
```

If `npm run web` boots but the app shows "missing SUPABASE_URL" or similar, Doppler isn't injecting properly — re-check the binding (`doppler configure --scope .`) and that you're in the right working directory.

---

## Daily commands

All env-touching commands wrap with `doppler run --` automatically via npm scripts:

```bash
npm start          # Expo dev server (auto-routes to platform picker)
npm run ios        # iOS simulator build + launch
npm run android    # Android emulator build + launch
npm run web        # Web dev server
npm run e2e        # Playwright e2e tests (needs real Supabase access)
npm run generate:movies  # build-time: regenerate static movie pages
```

Bare scripts (don't need env injection):

```bash
npm run lint            # ESLint
npx tsc --noEmit        # TypeScript check
npm test                # Jest unit tests (mocked, no env needed)
```

For ad-hoc commands not in `package.json`, prefix yourself: `doppler run -- node my-script.js`.

---

## Optional: connect to additional services

Only do these if your work touches the service.

### EAS (native builds)

```bash
npm install -g eas-cli      # installed once globally
eas login                   # OAuth flow
eas whoami                  # verify logged in
```

For native builds: `npm run ios` or `npm run android` should "just work." For EAS Build cloud builds: `eas build --platform ios --profile production` (uses EAS-stored env vars; sync from Doppler via `./scripts/sync-eas-secrets.sh prd` after any rotation).

### Vercel (web deploys)

Vercel deploys are CI-driven (auto-deploy on merge to `main`). For local Vercel debugging:

```bash
npm install -g vercel
vercel login
vercel link        # links this directory to the movie-tracker Vercel project
```

Env vars are pushed to Vercel automatically by the Doppler-Vercel integration — no manual sync needed.

### Supabase (edge functions)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref wliblwulvsrfgqcnbzeh
```

To deploy an edge function: `supabase functions deploy <fn-name>`. After any secret rotation, sync from Doppler via `./scripts/sync-supabase-secrets.sh prd`.

---

## Sync scripts

Live in `scripts/`. Run after rotating secrets or adding new ones to Doppler:

| Script | What it does |
|---|---|
| `./scripts/sync-eas-secrets.sh prd` | Push EAS-relevant keys from Doppler `prd` to EAS env vars |
| `./scripts/sync-supabase-secrets.sh prd` | Push server-side keys from Doppler `prd` to Supabase secrets |

**Vercel does not need a sync script** — its native Doppler integration auto-syncs on every Doppler change.

---

## Pre-commit hook (gitleaks)

Every `git commit` runs `gitleaks` against staged changes. Catches accidental secret pasted into code. Fails-closed if `gitleaks` isn't installed.

To bypass for a known-safe edge case:
```bash
git commit --no-verify
```
Use **rarely** — the whole point is to catch leaks before they ship.

To extend the allowlist (e.g., a known-safe placeholder pattern), edit `.gitleaks.toml`.

---

## Troubleshooting

### `doppler: not found` when running an npm script

You haven't installed Doppler CLI yet. Run `brew install dopplerhq/cli/doppler` and re-try.

### `Could not find requested project 'pocketstubs'`

You're authenticated to Doppler but don't have access to the workspace. Ask Tyshane for an invite. If you ARE invited, double-check `doppler whoami` shows the right account (might be logged in to a personal workspace).

### `npm install` succeeds but `.husky/_/` doesn't exist

Husky's `prepare` script was skipped. Run `npx husky` manually. If you're behind a corporate npm mirror that strips lifecycle scripts, you may need to enable them: `npm config set ignore-scripts false` (then re-run `npm install`).

### Pre-commit hook says "gitleaks not installed" even though I installed it

Check `which gitleaks` resolves. If it doesn't, your shell's `PATH` doesn't include Homebrew's bin. Add `eval "$(/opt/homebrew/bin/brew shellenv)"` to your shell rc.

### Web app loads but Supabase calls 401

Either the EXPO_PUBLIC_SUPABASE_ANON_KEY in Doppler is wrong, or there's a stale build cache. Try:
1. Verify the key in Doppler dashboard matches what's in Supabase Settings → API → `anon public`
2. Clear Expo cache: `npx expo start --clear`

### EAS build fails with "missing TMDB_API_KEY" or similar

EAS env vars are out of sync with Doppler. Run `./scripts/sync-eas-secrets.sh prd` to push current values from Doppler to EAS, then re-trigger the build.

### Vercel preview deploy fails with "missing env var"

Check that the Doppler-Vercel integration is configured for the **Preview** environment, not just Production. There should be two syncs in Doppler: one targeting Vercel Production, one targeting Vercel Preview. Both source from `prd` Doppler config until separate staging infra exists.

### `git pull` aborts with "untracked working tree files would be overwritten"

You have local files that conflict with files about to land from upstream. Compare them with `diff <(cat <file>) <(git show origin/main:<file>)`. If identical (common for files added in PRs you contributed to), delete the local copy and re-pull. If different, decide whether to keep your local version (move it aside) or accept upstream's (delete local).

---

## Adding a new secret

Quick version (full procedure in vault `Workflows/Secrets Management.md`):

```bash
# 1. Add to Doppler dev + prd (interactive — value not echoed to terminal)
doppler secrets set NEW_KEY --config dev
doppler secrets set NEW_KEY --config prd

# 2. Decide which platforms need it:
#    - Vercel:    add to Doppler-Vercel integration's secret allowlist (Doppler dashboard)
#    - EAS:       add the key name to EAS_KEYS array in scripts/sync-eas-secrets.sh, then run it
#    - Supabase:  add a matching prefix to scripts/sync-supabase-secrets.sh's grep filter, then run it

# 3. Trigger redeploy/rebuild on platforms that need to pick up the new value
```

---

## References

- **Codebase root:** `CLAUDE.md` — project overview + conventions
- **Vault (operational depth):** `Workflows/Secrets Management Index.md` → workflow, ADR (Doppler-Over-1Password), incident records, cross-project patterns
- **Vault (this PR's after-action):** `Projects/CineTrak/Risks/Vercel April 2026 Exposure.md`
- **Migration PR:** [#421](https://github.com/TyShaneONeill/movie-tracker/pull/421) — see for the full Doppler migration story
