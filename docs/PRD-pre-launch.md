*Last updated: 2026-05-27 — single source of truth for the 1.4.0 Android + iOS production submission.*

## Release Status

| Field | Value |
|-------|-------|
| Target version | 1.4.0 (bump from 1.3.0 in progress) |
| iOS target | App Store production (ASC App ID `6760832346`) |
| Android target | Play Store production (currently `track: "internal"` in `eas.json` — promote after smoke test) |
| iOS build number | 28 (will increment on next EAS build) |
| Android versionCode | 51 (will increment on next EAS build) |
| Bundle ID | `com.pocketstubs.app` (iOS + Android) |
| Domain | `pocketstubs.com` (Vercel, apex + www both Production) |
| Privacy policy URL | https://pocketstubs.com/privacy |
| Submission window | Next 48h |

---

## Shipped Since 1.3.0

Grouped by tester-feedback PRD and other PRDs that closed since the January 2025 PRD baseline.

### Tester-feedback track
- **PRD-1 Password visibility** + **PRD-2 System theme selector** — #476. Eye toggle on all password fields; Settings exposes Light / Dark / System.
- **PRD-3 First-launch coachmark tour** — #477. Interactive spotlight tour layered over the app shell on first launch.
- **PRD-4 In-app Help Center** — #479. Browsable help articles inside the app.
- **PRD-5 Feedback & feature request channel** — #480, #483, #484. In-app submission flow with Supabase backing.
- **PRD-6 Social share — Sprint 1 (spike)** — #485, #488. Confirmed `pocketstubs.com` is served from this repo (Vercel); deep-link URL scheme + Associated Domains + Android App Links wired in `app.config.js`; `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` served from apex with correct MIME (`application/json` pinned in `vercel.json`).
- **PRD-6 Social share — Sprint 2 (mobile)** — #489. Share buttons on Movie detail and TV detail (discovery cards, no user PII). Content deep links (`pocketstubs://movie/{id}`, `pocketstubs://tv/{id}`) live. Cold-start OOM fix included.

### Other PRDs closed
- **Premium gating** (`docs/PRD-premium-gating.md`) — RevenueCat-backed `usePremium()` hook, lock indicators, contextual upgrade prompts.
- **Push notifications** (`docs/PRD-push-notifications.md`) — Expo push tokens, master + per-feature toggles, release-calendar + TV-episode reminders via daily cron.
- **Reviews** (`docs/PRD-reviews.md`) — Phase 1 shipped (long-form reviews; engagement is later phases).
- **Ticket scanner** (`docs/PRD-ticket-scanner.md`) — Gemini-backed scan-ticket Edge Function.
- **AdSense approval** (`docs/PRD-adsense-approval.md`) — bot-visible SSR content pages on `pocketstubs.com`; `ads.txt` + `app-ads.txt` served.
- **Privacy model** (`docs/PRD-privacy-model.md`) — profile + per-content visibility (public / followers_only / private), RLS enforced.
- **iOS home-screen widget**, **release calendar**, **bug reporting (shake-to-report)** — all shipped in 1.3.0, no additional work needed for 1.4.0.

---

## Pre-submission Checklist (gates 1.4.0)

### Verified blockers
- [ ] **AdMob Android app ID is a Google test ID** — current `androidAppId` in `app.config.js:134` is `ca-app-pub-3940256099942544~3347511713` (test). **DEFERRED to 1.5.0**: gate ads to iOS only for 1.4.0. Done = banner / native / rewarded ad components no-op on Android (verify in `components/ads/banner-ad.tsx`, `components/ads/native-feed-ad.tsx`, `hooks/use-rewarded-ad.ts`).
- [ ] **`assetlinks.json` sha256_cert_fingerprints array is empty** — `public/.well-known/assetlinks.json` ships with `"sha256_cert_fingerprints": []`. Done = array contains the SHA-256 from the EAS production keystore (`eas credentials --platform android` → Production → copy SHA-256), file deployed to `https://pocketstubs.com/.well-known/assetlinks.json`, and Android App Links verifier returns OK.
- [ ] **Play Console Data Safety form** — separate doc being drafted. Done = form submitted in Play Console matching what the app actually collects (Supabase auth email, profile, ticket photos, PostHog analytics, Sentry crash data, push tokens, AdMob iOS-only ad ID).
- [ ] **Version bump to 1.4.0** — in progress. Done = `app.config.js` `version` + `runtimeVersion` = `1.4.0`, `package.json` `version` = `1.4.0` (no other files need touching; Settings reads from `expo-constants`).
- [ ] **`eas.json` Android track is `internal`** — intentional for first submission. Done after smoke test = manually promote 1.4.0 to production in Play Console (or change `track` to `production` for the next submission).

### Store listing
- [x] Privacy policy URL is the canonical https://pocketstubs.com/privacy — already linked in Settings, Help Center, and upgrade screens.
- [ ] **Update privacy policy "Last Updated" date and product name** — `docs/PRIVACY_POLICY.md` still says "Last Updated: January 25, 2025" and refers to "CineTrak". Done = refreshed to 2026-05 with PocketStubs branding and re-deployed to `/privacy`.
- [ ] **App Store screenshots refreshed for 1.4.0** — must show coachmark tour, theme selector, share sheet on Movie/TV detail, Help Center. Tooling per `ROADMAP-tester-feedback.md`: Figma frames + `fastlane screengrab`.
- [ ] **Play Store screenshots refreshed for 1.4.0** — same surfaces as iOS.
- [ ] **ASO long description rewrite** — ROADMAP-tester-feedback lists this as in-flight; not strictly gating but should land with screenshot refresh.
- [ ] **1.4.0 release notes drafted** — model on `docs/release-notes-v1.3.0.md`. Should mention: password eye, Light/Dark/System, coachmark tour, Help Center, in-app feedback, share-from-Movie/TV.
- [x] Support email / URL — already in Help Center.
- [x] Terms of service URL — already in Settings/Help (verify by tapping Settings → About if unsure).
- [x] App icons (light, dark, tinted iOS variants + Android adaptive) — `app.config.js:17-21,46-50`.
- [x] Splash screen (light + dark) — `app.config.js:106-117`.
- [x] iOS NSUserTrackingUsageDescription — `app.config.js:29`.
- [x] iOS ITSAppUsesNonExemptEncryption = false — `app.config.js:28`.
- [x] iOS Apple Sign-In (required by App Store when other SSO present) — `usesAppleSignIn: true`.
- [x] Android `ACTIVITY_RECOGNITION` blocked to avoid Health Apps declaration — `app.config.js:56`.

### Infrastructure & runtime
- [x] Sentry configured — `@sentry/react-native/expo` plugin in `app.config.js:96`.
- [x] PostHog analytics — `posthog-react-native` in `package.json`.
- [x] AdMob iOS configured with production app ID — `app.config.js:135` `iosAppId: ca-app-pub-5311715630678079~5445543222`.
- [x] `expo-tracking-transparency` — `app.config.js:118`.
- [x] AASA served from `pocketstubs.com` with `application/json` MIME — verified live with `swcutil dl -d pocketstubs.com` per PRD-social-share Sprint 1.
- [x] Apple Sign-In + Google Sign-In + Supabase auth wired.
- [x] Deep links wired: `pocketstubs://` custom scheme + `https://pocketstubs.com` Universal Links (iOS) and App Links (Android, pending fingerprint above).
- [ ] **Smoke test on physical iPhone (iOS 17+) and physical Android device** — full regression: auth, ticket scan, share Movie/TV, push permission, theme switch, coachmark tour first-launch, help center, feedback submission, deep link from a shared URL.
- [ ] **Confirm release channel** — production EAS build channel = `production` (`eas.json:21`). Done = `eas build --platform all --profile production` succeeds and OTA channel is `production`.
- [ ] **Verify Doppler production secrets bound** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` resolved at build time.

### Tests / CI
- [ ] `npm run lint` passes on the 1.4.0 commit.
- [ ] `npx tsc --noEmit` passes on the 1.4.0 commit.
- [ ] `npm test` (Jest unit) passes.
- [ ] ? **Playwright e2e** — `playwright.config.ts` exists; unclear if it's wired into pre-submission CI for 1.4.0. Verify by running `npm run e2e` against a preview build.

---

## Post-submission (staged rollout watch)

- [ ] Stage Android rollout 10% → 50% → 100% over 48–72h via Play Console.
- [ ] Stage iOS rollout via App Store Connect Phased Release (7-day default).
- [ ] Monitor Sentry crash-free sessions; abort rollout if drops below 99.5%.
- [ ] Monitor PostHog `app_open`, `share:*`, `onboarding:complete`, `review:create`, `scan:bonus_granted` — flag regressions vs 1.3.0 baseline.
- [ ] Watch tester-feedback channel (PRD-5) submissions for first-72h reports tied to 1.4.0 features.
- [ ] If `assetlinks.json` fingerprint is wrong, App Links silently fail — verify a shared `https://pocketstubs.com/movie/{id}` link opens the app on a real Android device.
- [ ] Promote Play track from `internal` → `production` once smoke test on real device is green.
- [ ] Confirm Universal Links open the app from Messages and Notes on a real iPhone (Apple caches AASA aggressively; if it fails, reinstall to refresh).

---

## Deferred to 1.5.0

- **PRD-6 Sprint 3 — Review share + First Take share.** Web fallback pages at `pocketstubs.com/review/{id}` and `pocketstubs.com/firsttake/{id}` + share-to-install attribution. User-authored card template family. Private-content refusal copy.
- **PRD-6 Sprint 4 — Polish.** Multiple card templates (light/dark, square/story), share-surface telemetry, A/B card variants.
- **Android AdMob.** Production app ID from `console.admob.com`; replace test ID in `app.config.js:134`; un-gate ads on Android.
- **Ticket stub sharing (v2 of PRD-6).** Blocked on friend-confirmation UX + direct-send privacy model — see PRD-social-share "Deferred to v2".
- **Reviews engagement (later phases of PRD-reviews).** Likes, comments, replies.
- **Notification preferences backend polish, data export, Letterboxd/Trakt integrations** — historically tracked in the old PRD; still deferred.
