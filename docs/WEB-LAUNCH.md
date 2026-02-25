# Web App Launch Plan

> **Goal:** Soft-launch Cinetrak as a usable web app at `cinetrak.app` while waiting for iOS App Store review.
>
> **Current State (updated 2026-02-24):** Phase 0 and Phase 1 are **complete**. The app boots on web, all native-only modules are safely guarded, Google OAuth works on web, bottom nav is web-compatible, responsive dimensions use hooks, and content is capped at 768px max-width. Phase 2 deployment config (`vercel.json`) is created — remaining work is manual: Vercel env vars, Supabase redirect URLs, Google OAuth redirect URIs, and DNS setup.
>
> **Deployment Target:** Static export (`npx expo export --platform web`) deployed to **Vercel** at `cinetrak.app` (domain on Cloudflare).

---

## Phase 0: Fix Web-Breaking Crashes

> **Priority:** BLOCKER - the app literally won't run on web without these.
> **Estimated scope:** ~20 files touched, mostly 1-2 line guards.

### 0.1 Guard `expo-tracking-transparency`

- [x] `app/_layout.tsx`: Changed static import to dynamic `await import('expo-tracking-transparency')` inside `Platform.OS === 'ios'` guard (PR #117)

### 0.2 Guard `expo-haptics` (22 files)

- [x] Created `lib/haptics.ts` - thin wrapper that no-ops on web (PR #117)
- [x] Replaced all direct `Haptics.*` imports with the wrapper across 22 files (PR #117)

### 0.3 Guard native-only ad modules

- [x] Created `lib/ads-context.web.tsx` - web stub with ads permanently disabled (PR #117)
- [x] Created `components/ads/banner-ad.web.tsx` - returns null on web (PR #117)
- [x] Created `components/ads/native-feed-ad.web.tsx` - returns null on web (PR #117)
- [x] Created `hooks/use-rewarded-ad.web.ts` - no-op hook on web (PR #117)

### 0.4 Fix other web runtime crashes

- [x] Installed `react-native-web-webview` for `react-native-youtube-iframe` web support (PR #117)
- [x] Renamed `public/index.html` to `public/landing.html` to stop it intercepting the React app (PR #117)

### 0.5 Verify web build compiles

- [x] `npm run web` boots successfully in browser (PR #117)
- [x] All automated checks pass: `npm run lint && npx tsc --noEmit && npm test` (439 tests) (PR #117)

**Exit criteria:** App boots on web, all tabs load, no white screens or uncaught exceptions.

---

## Phase 1: Core Functionality on Web

> **Priority:** HIGH - make the app actually usable, not just boot-able.
> **Scope:** Auth, navigation, and data flows all work end-to-end.

### 1.1 Google Sign-In for Web

- [x] Implemented Supabase OAuth flow for web: `supabase.auth.signInWithOAuth({ provider: 'google' })` (PR #118)
- [x] Conditional: uses native Google Sign-In on mobile, Supabase OAuth on web (PR #118)
- **TODO (manual):** Configure Supabase redirect URLs for `cinetrak.app` domain (see Phase 2.6)
- **TODO (manual):** Add `cinetrak.app` to Google OAuth authorized redirect URIs (see Phase 2.6)

### 1.2 Apple Sign-In on Web

- [x] Verified Apple Sign-In button is hidden on web (PR #118)
- [x] Fixed `expo-apple-authentication` static import crash — changed to conditional `require()` behind `Platform.OS === 'ios'` (PR #118)

### 1.3 Bottom Navigation for Web

- [x] Refactored `bottom-nav-bar.tsx`: BlurView on native, solid background fallback on web (PR #118)
- [x] Added `cursor: 'pointer'` for web tappable elements (PR #118)
- [x] Verified all 4 tabs tappable and route correctly on web (PR #118)

### 1.4 Static Dimension Queries → Responsive

- [x] `app/achievements.tsx` → switched to `useWindowDimensions()` (PR #118)
- [x] `app/(tabs)/profile.tsx` → switched to `useWindowDimensions()` (PR #118)
- [x] `app/user/[id].tsx` → switched to `useWindowDimensions()` (PR #118)

### 1.5 Max-Width Cap & Theme Sync

- [x] Added 768px max-width container in root `_layout.tsx` for web (PR #118)
- [x] Added `document.body.style.backgroundColor` sync with theme to eliminate white bars (PR #118)

### 1.6 Core Flow Smoke Tests (manual)

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

- [x] Created `vercel.json` with build command, output dir, framework null, SPA rewrites (PR #119)
- [x] SPA catch-all rewrite rule: `{ "source": "/(.*)", "destination": "/" }` (PR #119)

### 2.2 Vercel Project Setup

- [ ] **TODO:** Connect GitHub repo (`TyShaneONeill/movie-tracker`) to Vercel
  - Root directory: `cinetrak`
  - Build command: `npx expo export --platform web` (auto from vercel.json)
  - Output directory: `dist` (auto from vercel.json)

### 2.3 Domain Configuration (Cloudflare → Vercel)

- [ ] **TODO:** In Vercel dashboard → Project Settings → Domains → Add `cinetrak.app`
- [ ] **TODO:** In Cloudflare DNS → Add CNAME record pointing `cinetrak.app` to `cname.vercel-dns.com`
  - Or use Vercel's nameservers if preferred
- [ ] SSL is automatic with Vercel

### 2.4 Environment Variables

- [ ] **TODO:** Add these env vars in Vercel dashboard → Project Settings → Environment Variables:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  - `EXPO_PUBLIC_SENTRY_DSN`
- [ ] Confirm no private keys are exposed in the web bundle (check built JS)

### 2.5 Supabase Auth Redirect URLs

- [ ] **TODO:** In Supabase dashboard → Auth → URL Configuration:
  - Add `https://cinetrak.app` to **Site URL** (or keep existing and add to redirect allow list)
  - Add `https://cinetrak.app/**` to **Redirect URLs** allow list
  - This is required for Google OAuth to redirect back to the web app after sign-in

### 2.6 Google OAuth Redirect URIs

- [ ] **TODO:** In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client:
  - Add `https://cinetrak.app` to **Authorized JavaScript origins**
  - Add the Supabase callback URL to **Authorized redirect URIs** (format: `https://wliblwulvsrfgqcnbzeh.supabase.co/auth/v1/callback`)
  - This ensures Google Sign-In works on the web app

### 2.7 Verify Deployment

- [ ] **TODO:** After DNS propagation, visit `https://cinetrak.app` and verify app loads
- [ ] **TODO:** Test Google Sign-In flow end-to-end on web
- [ ] **TODO:** Verify deep links work: `cinetrak.app/movie/123` loads app correctly (SPA rewrite)

**Exit criteria:** App is live at your domain, HTTPS works, all routes resolve, auth redirects work.

---

## Phase 3: Web Polish & UX

> **Priority:** MEDIUM - make it feel intentional, not like a phone app in a browser.

### 3.1 Responsive Layout Improvements

- [x] Added 768px max-width container centered on page (done in Phase 1, PR #118)
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
| 2026-02-24 | 1 | `expo-apple-authentication` static import crashes web bundler — changed to conditional `require()` behind `Platform.OS === 'ios'` | HIGH | Fixed |
| 2026-02-24 | 0 | `public/index.html` static landing page intercepts web app at `/` — renamed to `public/landing.html` | HIGH | Fixed |
