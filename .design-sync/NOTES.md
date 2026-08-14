# design-sync NOTES — PocketStubs (cinetrak)

Repo-specific gotchas for future syncs. First sync 2026-08-03.

## Shape / architecture
- This is an Expo RN **app**, not a component package. The sync builds an internal shim package at `.design-sync/pkg/` (`@pocketstubs/design-system`) that compiles the app's real components through **react-native-web** (same aliasing as `npm run web`). `cfg.buildCmd` runs it; `cfg.entry` points at its `dist/index.es.js`.
- Component scope is the hand-curated export list in `.design-sync/pkg/index.ts` (presentational, props-only components — decided with Ty 2026-08-03). Adding a component to the sync = add its export there, rebuild.
- `componentSrcMap: {Colors, Fonts, Typography: null}` — token consts exported on `window.PocketStubs` but excluded from the component list ([BUNDLE_EXPORT] fires otherwise).

## Web-bundle shims (all in `.design-sync/pkg/build.mjs`)
Discovered layer-by-layer via [RENDER_ERRORS]; each was fatal for ALL components:
1. `loader: {'.js': 'jsx'}` — Expo packages ship JSX in .js files (42 esbuild errors otherwise).
2. `define: {global: 'globalThis'}` — RN code reads Node's `global`.
3. Banner `process` shim — something reads `process` beyond the defined env keys.
4. Banner `require()` polyfill returning the real `react`/`react-dom`/`react/jsx-runtime` namespaces — CJS deps' `require('react')` otherwise becomes esbuild's throwing stub. React stays EXTERNAL (converter maps to `_vendor/`); never inline react (two-copies hook errors).
5. Infra stubs by RESOLVED path (`.design-sync/pkg/stubs/`): `lib/supabase` (chainable no-op Proxy — real client throws "Missing Supabase environment variables" at import), `lib/sentry` (must mirror ALL exports incl. `setSentryUser` — lib/auth-context imports it), `hooks/use-auth` (`{user: null}`), AsyncStorage. Path-based plugin, not specifier alias — many lib services import `'./supabase'` relatively.
- `SignedPhoto` (components/journey/signed-photo.tsx) deliberately excluded — needs supabase signed-URL resolution.

## Theme / fonts
- Provider: `cfg.provider = ForcedThemeProvider {theme: 'dark'}` (from lib/theme-context; the real ThemeProvider is auth+storage-coupled — stubs make it importable but ForcedThemeProvider is the right preview wrapper).
- Fonts: expo-google-fonts — each weight is its OWN family name (`Outfit_800ExtraBold` etc.). `build.mjs` generates `@font-face` per family from the ttfs inside `node_modules/@expo-google-fonts/{outfit,inter,jetbrains-mono}` into `dist/styles.css`; converter copies them to `fonts/`. 12 families total.
- Tokens: `dist/styles.css` `:root` `--ps-*` vars generated from `constants/theme.ts` (dark default + light via prefers-color-scheme). Components consume the JS constants, not the CSS vars — the vars are reference for the design agent.

## Render check
- No playwright chromium cache on this Mac — use `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` for validate/capture (playwright package resolves from the app's node_modules).
- Previews need explicit fixed-width wrapper divs (RN-web components width-collapse in an unconstrained card). Skeletons/edges also need explicit height.
- Remote poster images (image.tmdb.org) avoided in previews — CSP in the product may block them; null poster_path renders the placeholder state, which is honest.

## Preview authoring conventions (folded from wave-primitives, 2026-08-03)
- **Every story needs an explicit dark canvas** (`backgroundColor: Colors.dark.background`, padding 16): the capture page is white while ForcedThemeProvider forces dark — surfaceless components render invisible, or SILENTLY WRONG (inactive stars in backgroundSecondary read as filled black on white; a 2-star rating looked like 5). The wrong-not-blank failure mode is the dangerous one.
- **Plain div wrappers don't stack RN Text**: RN View is flex-column by default, HTML div is not — two ThemedText siblings flow inline ("Weekly recapSunday summary…"). Stacking wrappers need explicit `display:'flex', flexDirection:'column'`.
- PerforatedEdge's notches paint in `colors.background` to fake punch-holes — the illusion requires page canvas == background and a card slab behind; on elevated surfaces callers pass `{...Colors.dark, background: <surface>}`.
- SwipeToConfirm: 0px-height was purely missing parent width (measures track via onLayout); gesture-handler + reanimated render fine on web statically.
- SearchInput carries its own marginHorizontal:20 — size wrappers ~40px wider.
- AchievementBadge: thin only with defaults; real stories are shelves (locked 40% opacity vs unlocked rose ring, gold level pip suppressed at level 0).
- StarRating `disabled` has no distinct paint (display-only path) — pair it with the interactive cell so the non-difference reads as intended.
- Import Colors/Typography from '@pocketstubs/design-system' in previews (no hardcoded hexes); wrap labels in ThemedText + Typography presets so brand fonts show.

## Folded from wave-cards (2026-08-03)
- **react-query context must come from the bundle's own copy**: an external QueryClientProvider is a different React context — hence `PocketStubsProvider` (QueryClient + ForcedTheme) exported from the pkg entry and set as cfg.provider. Components mounting LikeButton/LikedByIndicator need it.
- **auth-context stub**: ReviewCard's chain reaches `lib/auth-context` directly (not via hooks/use-auth) — both paths now stub to the same file (useAuth + pass-through AuthProvider).
- Components that paint their own `colors.card` surface (FirstTakeCard, MovieSearchCard via ThemedView) need no canvas wrapper; transparent-by-design ones do.
- SearchSkeletonList's entire styling contract is its `cardColor`/`shimmerColor` props — undefined = paints nothing (that was the "paints nothing" render warn). Hardcodes 6 cards.
- CollectionGridCard is `flex:1` + aspectRatio — frame must be a flex container with width.
- TicketFlipCard renders front face only statically (back face behind press-driven rotateY + backfaceVisibility; carousel page 2 behind useState) — skipped states, not skipped component.
- **StreakPunchCard dropped from scope**: zero-prop self-fetching container gated on the `streak_spine` PostHog flag — null in every static state. Standing offer: split a props-driven StreakPunchCardView in the app repo, then re-add.
- **validator false "root empty" on ALL RN-web pages**: react-native-web injects `<style id="react-native-stylesheet">` in head, which matches the validator's `[id^="r"]` roots selector as an empty roots[0]. Fixed at the source: build.mjs renames the id to `ds-rnw-stylesheet` in the dist (consistent rename, safe — id only used for the bundle's own dedup). If a converter update changes the selector this rename stays harmless.
- **Product bug found (not preview)**: `TicketFlipCard.formatDate` parses date-only strings as UTC midnight → shows previous day in negative-offset timezones. Same class as issue #794 (scan-path). Flagged on #794.

## Known render warns (triaged legitimate)
- GRID_OVERFLOW: resolved via cfg.overrides cardMode column for TicketReviewCard, TicketFlipCard, ToggleSwitch, TrendingCard, SwipeToConfirm, SearchResultCard, SearchSkeletonList, SectionHeader, StarRating (wide stories are those components' honest shapes).
- SearchSkeletonList story is taller than the review cell (hardcoded 6 cards) — last card clips in the sheet row; cosmetic.

## Re-sync risks
- The shim package's export list (`.design-sync/pkg/index.ts`) is a MANUAL scope — new app components don't appear until added there.
- Stub export surfaces (`stubs/sentry.ts` etc.) must be kept in sync with the real modules' export lists; a new named export in lib/sentry.ts consumed by a bundled module breaks the shim build ("No matching export in stub").
- Ticket/TMDB preview data in `.design-sync/previews/*.tsx` mirrors `ProcessedTicket`/`TMDBMatch` shapes — a schema change in lib/ticket-processor.ts silently stales them.
- Worktree: this sync ran from `cinetrak-design-sync` worktree with symlinked node_modules; a fresh clone needs `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` + the `.ds-sync/` staging + dep install per the skill.
