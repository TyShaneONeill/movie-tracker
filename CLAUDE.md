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

## Key Resources

- **PRD**: `docs/PRD-pre-launch.md` - Pre-launch checklist and requirements
- **Supabase Project**: `wliblwulvsrfgqcnbzeh`
- **GitHub Repo**: https://github.com/TyShaneONeill/movie-tracker
