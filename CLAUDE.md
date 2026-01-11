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
