# Web App Launch Plan

> **Goal:** Soft-launch Cinetrak as a usable web app at your domain while waiting for iOS App Store review.
>
> **Current State:** Expo + React Native Web architecture is in place. `npm run web` partially works. Core data layer (Supabase, TanStack Query) is platform-agnostic. Auth, routing, and most UI components have web support through Expo's transpilation. Several native-only calls will crash on web and need guarding.
>
> **Deployment Target:** Static export (`npx expo export --platform web`) deployed to Vercel/Netlify/Cloudflare Pages on your domain.

---

## Phase 0: Fix Web-Breaking Crashes

> **Priority:** BLOCKER - the app literally won't run on web without these.
> **Estimated scope:** ~20 files touched, mostly 1-2 line guards.

### 0.1 Guard `expo-tracking-transparency`

- [ ] `app/_layout.tsx` (line ~228): Wrap `requestTrackingPermissionsAsync()` in `Platform.OS === 'ios'` check

### 0.2 Guard `expo-haptics` (19 unguarded files)

Create a utility wrapper so we fix this once, not 19 times:

- [ ] Create `lib/haptics.ts` - thin wrapper that no-ops on web:
  ```ts
  import { Platform } from 'react-native';
  import * as Haptics from 'expo-haptics';
  export const hapticImpact = (style = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style);
  };
  export const hapticNotification = (type: Haptics.NotificationFeedbackType) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(type);
  };
  export const hapticSelection = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };
  ```
- [ ] Replace all direct `Haptics.*` imports with the wrapper in these files:
  - `app/settings/index.tsx`
  - `app/settings/edit-profile.tsx`
  - `app/settings/letterboxd-import.tsx`
  - `app/movie/[id].tsx`
  - `app/journey/movie/[tmdbId].tsx`
  - `app/journey/edit/[id].tsx`
  - `app/journey/[id].tsx`
  - `app/(auth)/signup.tsx`
  - `app/(auth)/signin.tsx`
  - `components/first-take-modal.tsx`
  - `components/cards/first-take-card.tsx`
  - `components/modals/trailer-modal.tsx`
  - `components/modals/login-prompt-modal.tsx`
  - `components/modals/review-modal.tsx`
  - `components/movie-status-actions.tsx`
  - `components/add-movie-modal.tsx`
  - `components/social/FollowButton.tsx`
  - `components/achievement-celebration.tsx`
  - `components/haptic-tab.tsx`

### 0.3 Verify web build compiles

- [ ] Run `npx expo export --platform web` and fix any additional build errors
- [ ] Run `npx serve dist` (or similar) to smoke-test in browser

### 0.4 Triage any other runtime crashes

- [ ] Open every tab in browser, tap through core flows, note crashes
- [ ] Fix anything that hard-crashes (white screen / error boundary)

**Exit criteria:** App boots on web, all tabs load, no white screens or uncaught exceptions.

---

## Phase 1: Core Functionality on Web

> **Priority:** HIGH - make the app actually usable, not just boot-able.
> **Scope:** Auth, navigation, and data flows all work end-to-end.

### 1.1 Google Sign-In for Web

The native `@react-native-google-signin/google-signin` package doesn't work on web. Options:

- [ ] **Option A (recommended):** Use Supabase's built-in OAuth flow for web
  - `supabase.auth.signInWithOAuth({ provider: 'google' })` redirects to Google, returns to app
  - Already have `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` configured
  - Need to add web redirect URL in Supabase dashboard (Auth > URL Configuration)
  - Conditional: use native Google Sign-In on mobile, Supabase OAuth on web
- [ ] **Option B:** Add `@react-oauth/google` for web-specific Google button
- [ ] Configure Supabase redirect URLs for web domain
- [ ] Test full sign-in → session → authenticated state flow on web

### 1.2 Apple Sign-In on Web

- [ ] Already properly guarded (`Platform.OS !== 'ios'`) - just verify the UI hides it on web
- [ ] Consider: Supabase supports Apple OAuth on web too, could add later (nice-to-have)

### 1.3 Bottom Navigation for Web

`components/ui/bottom-nav-bar.tsx` uses `pointerEvents` (RN-only) and `BlurView` (limited web support).

- [ ] Fix `pointerEvents` style usage for web compatibility
- [ ] Test BlurView rendering on web - if broken, add fallback background
- [ ] Verify all 4 tabs are tappable and route correctly on web
- [ ] (Optional) Create `bottom-nav-bar.web.tsx` with a more web-native layout

### 1.4 Static Dimension Queries → Responsive

Three files use `Dimensions.get('window')` which doesn't respond to browser resize:

- [ ] `app/achievements.tsx` → switch to `useWindowDimensions()`
- [ ] `app/(tabs)/profile.tsx` → switch to `useWindowDimensions()`
- [ ] `app/user/[id].tsx` → switch to `useWindowDimensions()`

### 1.5 Core Flow Smoke Tests (manual)

Walk through each flow in a browser and note issues:

- [ ] Browse/discover movies (home tab)
- [ ] Search for a movie
- [ ] View movie detail page
- [ ] Add movie to watchlist / mark as watched
- [ ] Rate a movie
- [ ] View profile / stats
- [ ] Settings page loads
- [ ] Sign out / sign in cycle
- [ ] Scanner tab (should show camera prompt or graceful fallback)

**Exit criteria:** A user can sign in, browse movies, manage their watchlist, and view their profile on web.

---

## Phase 2: Deployment & Domain Setup

> **Priority:** HIGH - get it live on your domain.

### 2.1 Build Configuration

- [ ] Verify `app.config.js` web output is `"static"`
- [ ] Run production build: `npx expo export --platform web`
- [ ] Test production build locally with `npx serve dist`

### 2.2 Choose & Configure Hosting

- [ ] **Vercel** (recommended - free, instant deploys, great for static):
  - Connect GitHub repo
  - Build command: `npx expo export --platform web`
  - Output directory: `dist`
  - Environment variables: copy from `.env.local`
- [ ] OR **Netlify** (also free, similar setup)
- [ ] OR **Cloudflare Pages** (free, fast global CDN)

### 2.3 Domain Configuration

- [ ] Point your domain (or subdomain like `app.yourdomain.com`) to hosting provider
- [ ] Configure SSL (automatic with Vercel/Netlify/CF)
- [ ] Update Supabase Auth redirect URLs to include web domain
- [ ] Update Google OAuth authorized redirect URIs for web domain

### 2.4 SPA Routing / Fallback

Static export with expo-router needs a catch-all redirect so direct URL access works:

- [ ] Configure hosting provider's rewrite rules (e.g., Vercel `rewrites` in `vercel.json`)
- [ ] Verify deep links work: `yourdomain.com/movie/123` should load the app, not 404

### 2.5 Environment & Secrets

- [ ] Verify all `EXPO_PUBLIC_*` vars are set in hosting provider
- [ ] Confirm no private keys are exposed in the web bundle (check built JS)

**Exit criteria:** App is live at your domain, HTTPS works, all routes resolve, auth redirects work.

---

## Phase 3: Web Polish & UX

> **Priority:** MEDIUM - make it feel intentional, not like a phone app in a browser.

### 3.1 Responsive Layout Improvements

- [ ] Add max-width container (e.g., 480px centered) so content doesn't stretch on desktop
- [ ] OR implement a responsive breakpoint system:
  - Mobile (<768px): current layout
  - Tablet/Desktop (>=768px): wider content area, possibly sidebar nav
- [ ] Fix any horizontally-scrolling lists that look odd on wide screens
- [ ] Test at common widths: 375px (mobile), 768px (tablet), 1280px (desktop)

### 3.2 Web-Specific Meta Tags & SEO

- [ ] Update `public/index.html` or use expo-router's `<Head>` component:
  - Open Graph tags (title, description, image)
  - Twitter Card tags
  - `<meta name="description" ...>`
  - `<meta name="theme-color" content="#09090b">`
  - Proper `<title>` tag
- [ ] Create an OG image (1200x630) for social sharing
- [ ] Add `robots.txt` and basic `sitemap.xml` if you want search indexing

### 3.3 PWA Support (Progressive Web App)

- [ ] Add `web.manifest` / PWA manifest to `app.config.js` or `public/`:
  ```json
  {
    "name": "CineTrak",
    "short_name": "CineTrak",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#09090b",
    "theme_color": "#09090b",
    "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }, ...]
  }
  ```
- [ ] Generate PWA icons (192x192, 512x512)
- [ ] Test "Add to Home Screen" on mobile browsers
- [ ] (Optional) Add service worker for offline support

### 3.4 Favicon & Browser Tab

- [ ] Verify favicon renders in browser tab (already configured in `app.config.js`)
- [ ] Add apple-touch-icon for iOS Safari bookmarks
- [ ] Set proper page titles per route (expo-router `<Head>`)

### 3.5 Web-Specific UI Tweaks

- [ ] Add cursor: pointer to all tappable elements (Pressable may not do this automatically)
- [ ] Verify hover states on interactive elements
- [ ] Check that keyboard navigation (Tab key) works on forms
- [ ] Verify text selection behavior (should be disabled on UI elements, enabled on content)
- [ ] Test scroll behavior (smooth scrolling, no rubber-banding artifacts)

**Exit criteria:** App looks intentional on web, has proper meta tags, can be installed as PWA.

---

## Phase 4: Nice-to-Haves & Iteration

> **Priority:** LOW - do these after launch based on user feedback.

### 4.1 Desktop Navigation

- [ ] Consider replacing bottom tab bar with sidebar nav on desktop widths
- [ ] Add breadcrumb navigation for nested screens (movie detail, etc.)

### 4.2 Web-Only Features

- [ ] Keyboard shortcuts (e.g., `/` to search, `Esc` to close modals)
- [ ] Browser back/forward button support (verify expo-router handles this)
- [ ] Share buttons using Web Share API

### 4.3 Performance

- [ ] Analyze bundle size (`npx expo export --platform web` + source map analysis)
- [ ] Lazy-load heavy screens/components
- [ ] Optimize images for web (WebP, proper sizing)
- [ ] Add loading skeleton states for slow connections

### 4.4 Analytics & Monitoring

- [ ] Verify Sentry works on web (error reporting)
- [ ] Add basic web analytics (Plausible, Umami, or similar privacy-friendly option)
- [ ] Monitor Core Web Vitals

### 4.5 Auth Enhancements

- [ ] Add Apple Sign-In on web via Supabase OAuth (if demand exists)
- [ ] Add "Magic Link" email sign-in option for web
- [ ] Consider social sign-in additions (GitHub, Discord - easy via Supabase)

### 4.6 Ads on Web

- [ ] `react-native-google-mobile-ads` doesn't work on web (gracefully disabled already)
- [ ] If monetization needed: add Google AdSense or similar web ad solution
- [ ] Keep ad-free initially for soft launch

---

## Reference: What Already Works on Web

These components/systems need no changes:

| System | Status | Notes |
|--------|--------|-------|
| Supabase data layer | Works | All queries/mutations platform-agnostic |
| TanStack Query | Works | Caching, refetching, etc. all work |
| expo-router | Works | File-based routing translates to web URLs |
| expo-image | Works | Full web support with same API |
| Fonts (Inter, Outfit) | Works | expo-google-fonts loads via Google Fonts API |
| Animations (reanimated) | Works | Web implementations included |
| Gesture handler | Works | Web gesture support included |
| Bottom sheet (@gorhom) | Works | Web support included |
| Error boundary | Works | React error boundaries are universal |
| Deep link handler | Works | `Linking.parse()` works with web URLs |
| Auth session persistence | Works | Falls back to localStorage on web |
| Camera/Scanner | Works | Has Platform.OS === 'web' guards, uses browser API |
| AsyncStorage | Works | Web implementation via localStorage |
| expo-linear-gradient | Works | Web implementation exists |
| expo-blur (BlurView) | Partial | Has web implementation, may look slightly different |

## Reference: Known Non-Issues

| Item | Why It's Fine |
|------|---------------|
| Ads (AdMob) | Components already return `null` when unavailable |
| Apple Sign-In | Already gated behind `Platform.OS === 'ios'` |
| expo-secure-store | Supabase client already falls back to localStorage |
| SF Symbols (iOS icons) | `icon-symbol.tsx` fallback uses Material Icons |

---

## iOS Verification Checklist

> **Run this after every phase** to confirm nothing regressed on iOS.
> Each phase gets its own branch and PR - never merge without passing these checks.

### Automated Checks (run on every PR)

```bash
npm run lint            # ESLint passes
npx tsc --noEmit        # TypeScript compiles with no errors
npm test                # All unit tests pass
```

### After Phase 0 (Crash Guards)

- [ ] `npm run ios` - app boots on simulator
- [ ] Haptic feedback still fires on tap (watchlist button, tab bar, sign-in)
- [ ] ATT tracking prompt still appears on iOS (first launch or reset simulator)
- [ ] Sign in with Google (native flow unchanged)
- [ ] Sign in with Apple (native flow unchanged)
- [ ] Navigate all tabs - no crashes or missing content

### After Phase 1 (Core Functionality)

- [ ] `npm run ios` - app boots on simulator
- [ ] Google Sign-In still uses native flow (not Supabase OAuth redirect)
- [ ] Apple Sign-In still works
- [ ] Bottom tab bar looks and behaves the same (blur, haptics, animations)
- [ ] Profile page renders correctly (dimension changes didn't break layout)
- [ ] Achievements page grid looks the same
- [ ] User profile page (`/user/[id]`) renders correctly

### After Phase 2 (Deployment)

- [ ] `npm run ios` - no changes expected (deployment is web-only config)
- [ ] Quick smoke test: sign in, browse, view movie detail, check profile

### After Phase 3 (Web Polish)

- [ ] `npm run ios` - app boots on simulator
- [ ] No visual regressions on any screen (meta tags / PWA files are web-only)
- [ ] If any shared styles were touched: verify affected screens on iOS
- [ ] Verify no new imports were added to shared files that break native

### After Phase 4 (Nice-to-Haves)

- [ ] `npm run ios` - full regression pass
- [ ] Test any shared code paths that were modified
- [ ] Confirm bundle size hasn't grown unexpectedly (`npx expo export --platform ios` if needed)

### Quick Regression Script

Save time by running this one-liner before every PR:

```bash
npm run lint && npx tsc --noEmit && npm test
```

If all three pass and the iOS simulator boots + basic flows work, you're good to merge.

---

## Discovered Issues Log

> Add any new issues found during implementation here.

| Date | Phase | Issue | Severity | Status |
|------|-------|-------|----------|--------|
| 2026-02-24 | 0 | `react-native-google-mobile-ads` `require()` crashes web bundler even inside Platform guard — need `.web.tsx` stubs | HIGH | Fixed |
| 2026-02-24 | 0 | `react-native-youtube-iframe` needs `react-native-web-webview` peer dep for web | MEDIUM | Fixed |
| 2026-02-24 | 0 | `expo-tracking-transparency` static import crashes web — need dynamic `await import()` inside Platform guard | HIGH | Fixed |
| 2026-02-24 | 0 | Sentry build fails locally without `SENTRY_DISABLE_AUTO_UPLOAD=true` (pre-existing, not web-related) | LOW | Noted |
| 2026-02-24 | 0 | AdMob `GADApplicationIdentifier` missing from Info.plist after stale native build — `npx expo prebuild --platform ios --clean` fixes (pre-existing) | LOW | Noted |
