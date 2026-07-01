# Ticket Scan v2 — PR 7 Brief: theme-aware ALL of v2 (light/dark/system)

**Goal:** make every Ticket Scan v2 surface follow the account theme (light/dark/system), instead of being dark-only. Behind `ticket_scan_v2`. **JS-only → OTA-able.** Flag-OFF byte-identical (only v2 files + 2 app render-body refs change).

**The theme foundation is ALREADY written** in `constants/scan-v2-theme.ts` (do NOT re-edit it):
- `useScanColors()` → returns the light or dark palette via `useEffectiveColorScheme()`.
- `ScanV2ColorsDark` / `ScanV2ColorsLight` (exported palettes).
- `ScanV2Accent` (UNCHANGED, theme-invariant rose — leave all `ScanV2Accent.x` refs as-is).
- The bare `ScanV2Colors` export was REMOVED → tsc will error on any un-migrated `ScanV2Colors.x` ref. That's the completeness gate: when tsc is clean, the migration is complete.

Worktree: `/private/tmp/.../scratchpad/pr7-build` (branch `feature/ticket-scan-v2-theme`).

## The mechanical swap (apply to every v2 component)
1. Add `import { useScanColors } from '@/constants/scan-v2-theme';` (keep the existing `ScanV2Accent` import).
2. At the top of EACH React component's render body, add `const c = useScanColors();`.
3. Replace every `ScanV2Colors.x` → `c.x`. Leave every `ScanV2Accent.x` UNCHANGED.
4. **Hooks rule — per component:** every React component AND every sub-component/helper-component in a file that references colors needs its OWN `const c = useScanColors();` (a hook can't be hoisted to module scope or shared across components). Many scan-v2 files define helper components (e.g. `GlassButton`, `StubField`, `SectionCard`, `EditField`, `ScansPill`, `Chip`, wheel columns) — each that uses colors gets its own `const c = useScanColors();`. If a helper is NOT a component (a plain function), either make the caller pass the color in, or convert it — but per recon all refs are in render bodies, so this should be rare.

## Files (18 components + 2 app files) — swap all `ScanV2Colors.x` → `c.x`
journey-card.tsx, edit-journey-sheet.tsx, first-take-sheet.tsx, journey-screen.tsx, edit-sheet.tsx, picker-overlay.tsx, review-card.tsx, primitives.tsx, resolve-dialog.tsx, companion-picker.tsx, screen-review.tsx, rating-slider.tsx, screen-unable.tsx, screen-permission.tsx, time-wheel.tsx, avatar-stack.tsx, scan-v2-flow.tsx — plus the 2 app render bodies: `app/(tabs)/scanner.tsx` (the `ScanV2Colors.bg` loading view) and `app/journey/movie/[tmdbId].tsx` (the `ScanV2Colors.bg` resolving view).

## Special cases (handle exactly)
1. **`screen-camera.tsx` — STAYS DARK.** Do NOT use `useScanColors()`. Import `ScanV2ColorsDark` and swap its `ScanV2Colors.x` refs → `ScanV2ColorsDark.x`. Leave `ScanV2Accent.x` + all hardcoded `#fff`/`#000`/`rgba(...)`/BlurView as-is. (Live camera feed is dark imagery; white chrome over it is the only legible choice.)
2. **`primitives.tsx` `Icon` default param (~L79):** `color = ScanV2Colors.text` can't call a hook. Change the prop to `color?: string` and resolve in the body: `const c = useScanColors(); const resolved = color ?? c.text;` then use `resolved`. Apply the same in-body pattern to any other primitive whose default referenced a color. Each primitive component (`ScansPill`, `Chip`, `PillButton`, `TopBar`, etc.) gets its own `const c = useScanColors()`.
3. **`journey-screen.tsx` — remove the force-dark lock.** It wraps the screen in `<ForcedThemeProvider theme="dark"> … </ForcedThemeProvider>` (≈L365 open, ≈L578 close). REMOVE the wrapper (both tags) + the `ForcedThemeProvider` import, so the embedded theme-aware children (the reused AI-generation button, upgrade/login modals) follow the real account theme too. (The v2 components are now theme-aware via `useScanColors()`, so the lock is no longer needed.)

## Gotchas
- Keep `ScanV2Accent` imports + refs exactly as they are (theme-invariant).
- Don't touch `constants/scan-v2-theme.ts` (already written).
- `useScanColors()` is a hook — only call it inside components (render body), never at module level or in a non-component function or a default param.
- A `const c = useScanColors()` already at the top of a component is reused by all that component's JSX — don't add duplicates within the same component.
- After swapping, `rg 'ScanV2Colors\b' components/scan-v2 app` should return ZERO matches except `ScanV2ColorsDark` in `screen-camera.tsx`. (tsc enforces this.)

## Proof-of-work gate
- `npx tsc --noEmit` clean (this is the completeness gate — any missed ref errors). `npx eslint` 0 errors on changed files (watch react-hooks/rules-of-hooks + exhaustive-deps). `npx jest --testPathIgnorePatterns '/.worktrees/'` all pass.
- **Flag-off byte-identical:** the change only touches v2 components + the 2 app render-body refs + the theme file; the v1 flow is untouched.

## Out of scope
No visual redesign — same layout, just theme-aware colors. Camera stays dark. No new features.
