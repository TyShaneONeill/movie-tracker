# Play Console Data Safety Checklist (PocketStubs 1.4.0)

Authoritative answers for the Google Play Console "Data Safety" form for the 1.4.0 submission, plus the equivalent App Store Privacy Nutrition Label mapping for iOS. Source-of-truth for user-facing wording: [`docs/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). All citations below are to files in this repo.

> Scope: this file documents what the app *actually* does today. Items flagged "OPEN" need a human answer before the form is submitted.

---

## 1. Data Types Collected

Each row is a Play Console "Data type" category. **Collected** = leaves the device. **Shared** = sent to a 3P that is *not* a pure processor (Supabase, our backend, RevenueCat, etc. are processors and are reported as "Collected"; ad networks and analytics that we don't control are "Shared"). **Ephemeral** = sent for processing but not persisted.

### Personal info — YES

| Field | Collected | Shared | Required | Ephemeral | Where |
|---|---|---|---|---|---|
| Email address | Yes | No | Yes (account) | Persisted | `lib/auth-context.tsx` (signIn/signUp); `supabase/migrations/20260525063629_remote_schema.sql` → `auth.users` |
| User-set name / username / display name | Yes | No | Optional | Persisted | `supabase/migrations/...` → `public.profiles.username`, `full_name` |
| Bio (free-text) | Yes | No | Optional | Persisted | `public.profiles.bio` |
| Other info (Apple/Google ID token sub) | Yes | No | Conditional | Persisted | `lib/auth-context.tsx` (lines 277, 327) — passed to Supabase Auth as the OAuth identity |

### Financial info — NO (with caveat)

We do NOT process card numbers, billing addresses, or financial account info ourselves. Purchases run through RevenueCat → Apple/Google billing; we only receive a customer ID and entitlement.

| Field | Collected | Notes |
|---|---|---|
| Purchase history | Yes | `public.subscriptions` stores `revenuecat_customer_id`, `product_id`, `store`, `store_transaction_id`. Not card data. Mark **"Purchase history – Yes, collected, no third-party sharing, required, app functionality"**. |
| Credit card / payment info | No | Handled by Apple App Store / Google Play / RevenueCat; never touches PocketStubs |

### Health & Fitness — NO

`ACTIVITY_RECOGNITION` is explicitly blocked in `app.config.js` line 56 to prevent the auto-merged expo-sensors permission from triggering the Health Apps declaration.

### Messages — NO

We do not collect SMS, MMS, or email messages. (Bug-report subjects/bodies are app-feedback, not user-to-user messages.)

### Photos and videos — YES

| Field | Collected | Shared | Required | Ephemeral | Where |
|---|---|---|---|---|---|
| Profile photo (avatar) | Yes | No | Optional | Persisted | `lib/avatar-service.ts` (uploads to Supabase Storage `avatars/{userId}/`) |
| Ticket photo (scanner) | Yes | Yes (Google Gemini) | Optional (only if user uses scanner) | **Ephemeral** at Gemini; cropped JPEG persisted to Supabase Storage as part of theater visit | Camera/library: `app/(tabs)/scanner.tsx` lines 350, 379. Upload: `hooks/use-scan-ticket.ts` lines 173–184 → edge function `supabase/functions/scan-ticket/index.ts` line 562 (`generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash`). Cropped photo stored: `hooks/use-scan-ticket.ts` lines 403–409 (`ticketPhotoUri`) → `theater_visits` row |
| Bug-report screenshot | Yes | No | Optional | Persisted as base64 to `feature_requests.screenshot_url` | `lib/bug-report-client.ts` line 6 (`screenshot_base64`), `app/settings/feedback.tsx` line 142 |

### Audio files — NO

No microphone permission requested; no audio recording features.

### Files and docs — YES (narrow)

| Field | Collected | Notes |
|---|---|---|
| Letterboxd CSV import | Yes (parsed client-side) | `app/settings/letterboxd-import.tsx`; the file is parsed locally with papaparse and only the resulting movie rows are written to `user_movies`. The CSV itself is not uploaded. Mark **NO** for the Play category since only derived movie data leaves the device. |

### Calendar — NO

No calendar permissions or APIs are used. The in-app "release calendar" is server-side TMDB release-date data, not the user's device calendar.

### Contacts — NO

No address-book access. Friend-finding is by username search only (`hooks/use-user-search.ts`).

### App activity — YES

| Field | Collected | Shared | Required | Ephemeral | Where |
|---|---|---|---|---|---|
| App interactions (events) | Yes | Yes (PostHog) | Required for analytics | Persisted at PostHog | `lib/analytics.ts` (lines 13–47) — `analytics.track(...)` called throughout: `hooks/use-scan-ticket.ts` line 146, `app/settings/index.tsx` line 54, etc. |
| In-app search history | Yes | No | Optional | Persisted | `hooks/use-recent-searches.ts` writes to AsyncStorage on device; not uploaded |
| Installed apps | No | — | — | — | Not collected |
| Other user-generated content | Yes | No | Optional | Persisted | Reviews (`public.reviews.review_text` up to 2000 chars), first takes (`public.first_takes.quote_text` up to 500 chars), custom lists (`public.user_lists`), comments (`public.review_comments`), ratings 1–10 (`public.reviews.rating`), reports (`public.reports.description`), feedback (`public.feature_requests`) — see `supabase/migrations/20260525063629_remote_schema.sql` |
| Other actions (likes, follows, watchlist) | Yes | No | Optional | Persisted | `public.user_movie_likes`, `public.follows`, `public.user_movies`, `public.theater_visits`, `public.first_takes`, `public.user_lists` |

### Web browsing — NO

We do not track web browsing history.

### App info and performance — YES

| Field | Collected | Shared | Required | Ephemeral | Where |
|---|---|---|---|---|---|
| Crash logs | Yes | Yes (Sentry) | Required | Persisted at Sentry | `lib/sentry.ts` lines 20–48; init in `lib/sentry-init.ts` |
| Diagnostics / performance | Yes | Yes (Sentry) | Required | Persisted at Sentry | `lib/sentry.ts` line 28 (`tracesSampleRate`) |
| Other app performance data | Yes | Yes (PostHog) | Required | Persisted at PostHog | `lib/analytics.ts` `captureAppLifecycleEvents: true` (line 39) |

### Device or other IDs — YES

| Field | Collected | Shared | Required | Ephemeral | Where |
|---|---|---|---|---|---|
| Expo push token (device-scoped) | Yes | No (sent only to Expo Push service when we send a notification) | Optional (only if user opts in to notifications) | Persisted | `lib/push-notification-service.ts` lines 75–112; stored in `public.push_tokens` (token, platform, device_name) |
| Device model name | Yes | No | Optional | Persisted | `lib/push-notification-service.ts` line 104 (`Device.modelName`) → `push_tokens.device_name` |
| Advertising ID (IDFA / GAID) | Yes | Yes (AdMob, iOS only — gated by ATT prompt) | Optional | Persisted at AdMob | `app/_layout.tsx` lines 371–379 (ATT prompt); `lib/ads-context.tsx` (AdMob SDK init); `app.config.js` lines 131–137 (`react-native-google-mobile-ads`). iOS only for 1.4.0 — Android AdMob app ID is still the test ID with a TODO in `app.config.js` line 133. |
| Sentry user ID | Yes | Yes (Sentry) | Required | Persisted | `lib/sentry.ts` line 55 — only `userId` is attached, no email/name per the comment on line 53 |
| PostHog distinct ID | Yes | Yes (PostHog) | Required | Persisted | `lib/analytics.ts` line 66 (`identify(userId)`) |
| RevenueCat appUserID | Yes | Yes (RevenueCat) | Conditional (purchase flow) | Persisted | `lib/premium-context.tsx` line 182 (`configure({ apiKey, appUserID: userId })`) |

### Location — NO

We do not request foreground or background location, and we do not derive approximate location from IP on-device. The `location_name` column on `theater_visits` (`lib/database.types.ts` line 1657) is a free-text theater name (e.g. "AMC Empire 25") parsed from the ticket image, not a geo-coordinate.

### Audio recordings, Health & Fitness, Health Connect — NO

---

## 2. Third-Party SDKs / Data Sharing

| SDK | Data it handles | Why | Linked to user identity? | Used for advertising? |
|---|---|---|---|---|
| Supabase (`@supabase/supabase-js` — `lib/supabase.ts`) | Email, password hash, all user content, push tokens, theater visits, ticket photos, screenshots | Backend / auth / storage | Yes | No |
| Sentry (`@sentry/react-native` — `lib/sentry.ts`) | Crash stack traces, breadcrumbs, performance traces, user ID only (no email/name — see line 53 comment) | Crash & performance monitoring | Yes (user ID) | No |
| PostHog (`posthog-react-native`, `posthog-js` — `lib/analytics.ts`) | App events, screen views, session lifecycle, user ID | Product analytics | Yes | No |
| Google AdMob (`react-native-google-mobile-ads` — `lib/ads-context.tsx`, `components/ads/*`) | IDFA (post-ATT consent), device info, ad interactions | Show banners / native / rewarded ads | Yes (advertising ID) | **Yes** |
| Google Sign-In (`@react-native-google-signin/google-signin` — `lib/auth-context.tsx` line 327) | Google profile (name, email, picture, sub) | OAuth sign-in | Yes | No |
| Apple Sign-In (`expo-apple-authentication` — `lib/auth-context.tsx` line 277) | Apple ID identity token, name (first sign-in only), relay email | OAuth sign-in | Yes | No |
| Facebook Sign-In (Supabase OAuth via `expo-web-browser` — `lib/auth-context.tsx` lines 392–430) | Facebook email + basic profile (name, picture) per user authorization | OAuth sign-in. **No native Facebook SDK** — redirect-only flow, so no IDFA/AAID is shared with Meta from this app. | Yes | No |
| RevenueCat (`react-native-purchases` — `lib/premium-context.tsx` line 179) | App user ID, store transaction IDs, entitlement state | Subscription billing | Yes | No |
| TMDB API (server-side only — `supabase/functions/*/index.ts`) | None from the user — only `tmdb_id` lookups | Movie/TV metadata | No | No |
| Google Gemini (`generativelanguage.googleapis.com` — `supabase/functions/scan-ticket/index.ts` line 562) | Base64 ticket photo, processed ephemerally; not persisted at Google | OCR / ticket extraction | Anonymous (no user identifier passed) | No |
| Expo Updates (`expo-updates` — `app.config.js` line 8, `runtimeVersion` 1.4.0) | Update channel, runtime version, anonymous install ID | OTA updates | No | No |
| Expo Notifications / Expo Push (`expo-notifications` — `lib/push-notification-service.ts`) | Expo push token, notification payload at delivery time | Push delivery | Yes (token ↔ user) | No |
| Expo Tracking Transparency (`expo-tracking-transparency` — `app/_layout.tsx` line 375) | iOS ATT prompt only | Gates AdMob IDFA access | — | — |

Not in the app for 1.4.0 (do NOT list): Mixpanel, Branch, Adjust, Segment, Firebase Analytics, OneSignal. (Note: Facebook IS listed above — it ships via Supabase OAuth redirect, not the native Facebook SDK, which is why no `react-native-fbsdk-next` appears in `package.json`.)

---

## 3. Security Practices (Play form Yes/No)

- **Is data encrypted in transit?** **Yes.** All client → server traffic is HTTPS/TLS (Supabase enforces TLS, Sentry/PostHog/AdMob/RevenueCat default to HTTPS).
- **Is data encrypted at rest?** **Yes** for Supabase (Postgres + Storage; see [Privacy Policy](./PRIVACY_POLICY.md#data-storage-and-security)). Local auth tokens are stored in iOS Keychain / Android Keystore via `expo-secure-store` (`lib/supabase.ts` line 5 → `lib/secure-storage.ts`), not plaintext AsyncStorage.
- **Do you follow the Play Families Policy?** N/A — content rating is 13+ (`docs/PRIVACY_POLICY.md` "Children's Privacy").
- **Has your app been independently validated against a global security standard?** **No.**
- **Can users request that their data be deleted?** **Yes.** In-app account deletion is wired and reachable:
  - UI: `app/settings/index.tsx` line 356 → `app/settings/delete-account.tsx`
  - Backend: edge function `supabase/functions/delete-account/index.ts`
  - Out-of-app: email `privacy@pocketstubs.com` (per Privacy Policy — rebranded 2026-05-28 in this PR).
- **Committed to Play Families Policy?** N/A.
- **Do users have a way to opt out of data collection?** **Partial — flag this on the form.**
  - Push notifications: Yes — `app/settings/notifications.tsx` (controls `public.notification_preferences`).
  - Marketing communications: Yes — same screen.
  - Ads: No in-app toggle; iOS users decline IDFA via the system ATT prompt (`app/_layout.tsx` line 376); Premium subscribers get ads disabled automatically (`lib/ads-context.tsx` line 24 comment).
  - Sentry crash reporting: **No in-app toggle** — always on in production builds.
  - PostHog analytics: **No in-app toggle** — always on when `EXPO_PUBLIC_POSTHOG_API_KEY` is set.
  - **OPEN #2:** Play requires a documented opt-out for analytics/diagnostics if you claim "users can opt out". Either add a settings toggle for Sentry+PostHog before submission, or answer "No" to the opt-out question.

---

## 4. iOS App Store Privacy Nutrition Labels — Mapping

App Store categories overlap but are not 1:1. For each Play category marked YES above, here is the corresponding App Store entry:

| Play category (YES) | App Store category | "Linked to user"? | "Used for tracking"? |
|---|---|---|---|
| Personal info (email, name, username, bio) | **Contact Info → Email Address**; **User Content → Other User Content** (bio) | Yes | No |
| Financial info (purchase history) | **Purchases → Purchase History** | Yes | No |
| Photos and videos (avatar, ticket photo, screenshot) | **User Content → Photos or Videos** | Yes | No |
| App activity — events | **Usage Data → Product Interaction** | Yes (via PostHog distinct ID) | No |
| App activity — user-generated content | **User Content → Other User Content** | Yes | No |
| App info and performance — crash | **Diagnostics → Crash Data** | Yes (Sentry user ID) | No |
| App info and performance — perf | **Diagnostics → Performance Data** | Yes | No |
| Device or other IDs — push token | **Identifiers → Device ID** | Yes | No |
| Device or other IDs — IDFA (AdMob) | **Identifiers → Device ID** | Yes | **Yes (Tracking)** — gated by ATT |
| Device or other IDs — Sentry/PostHog/RevenueCat IDs | **Identifiers → User ID** | Yes | No |

Anything marked "Used for Tracking" on App Store requires the ATT prompt — already in place (`app/_layout.tsx` line 376) and string declared (`app.config.js` line 29 `NSUserTrackingUsageDescription`).

---

## 5. Open Questions for the User

1. ~~**Privacy policy email address.**~~ **RESOLVED 2026-05-28** — Rebranded to PocketStubs, contact email is `privacy@pocketstubs.com`, date stamp refreshed. See `docs/PRIVACY_POLICY.md` in this PR.
2. **Analytics opt-out.** Settings → Privacy toggles for Sentry + PostHog are being built on this branch (commit pending). Once shipped, answer **"Yes"** to the Play opt-out question. If the toggle build slips, fall back to **"No"**.
3. ~~**Facebook Sign-In.**~~ **RESOLVED 2026-05-28** — Facebook auth ships in 1.4.0 via Supabase OAuth (in-app browser redirect, not the native Facebook SDK). Code path verified reachable on Android / iOS / Web. Listed in the SDK table above. Requires Supabase dashboard to have Facebook OAuth enabled for project `wliblwulvsrfgqcnbzeh` — **confirm in dashboard before submission**.
4. ~~**AdMob on Android.**~~ **RESOLVED 2026-05-28** — Production Android AdMob app ID `ca-app-pub-5311715630678079~2922188131` issued and committed (`app.config.js:134`). All six ad unit IDs (3 banners, 1 native, 2 rewarded) now platform-conditional in `components/ads/*` and `hooks/use-rewarded-ad.ts`. Android ads will serve real inventory after the next production build.
5. **Gemini data retention.** Google's Gemini API has different retention rules for free vs paid tier; the scan-ticket edge function uses an API key (`GEMINI_API_KEY`, line 717 of `scan-ticket/index.ts`). Is the project on the paid tier with no-retention (so we can answer "data processed ephemerally" for ticket photos)?
6. **Ticket photo persistence.** Cropped JPEGs of tickets are attached to `theater_visits` rows (`hooks/use-scan-ticket.ts` line 409). Are they uploaded to Supabase Storage as part of the journey/visit save, or kept only on-device? If uploaded, confirm the bucket name so it can be cited here.
7. **AI ticket extraction disclosure.** Play's "AI" labelling rules (effective 2024) ask you to declare GenAI use. Confirm we will tick the AI feature box on the form for ticket scanning.
8. **Data deletion SLA.** Privacy Policy promises 30-day deletion (line 104). Does `supabase/functions/delete-account/index.ts` do an immediate hard delete, or does it queue? Match the form answer to the actual behaviour.

---

## Summary (for the developer filling the form)

- **Data categories marked YES:** 8 of 14 — Personal info, Financial info (purchase history only), Photos & videos, Files & docs (narrow), App activity, App info & performance, Device/Other IDs, plus the implicit "Other user content" subcategory under App activity.
- **Third-party SDKs / endpoints enumerated:** 13 — Supabase, Sentry, PostHog, AdMob, Google Sign-In, Apple Sign-In, Facebook Sign-In (OAuth redirect, no native SDK), RevenueCat, TMDB, Gemini, Expo Updates, Expo Notifications/Push, Expo Tracking Transparency.
- **Open questions:** 8 originally — #1 (email) and #3 (Facebook) resolved 2026-05-28; #2 (analytics opt-out) being built; #4 (AdMob Android) pending paste of manually-issued AdMob app ID; #5–8 (Gemini retention tier, ticket photo persistence, AI feature box declaration, deletion SLA) still need user input before form submission.
