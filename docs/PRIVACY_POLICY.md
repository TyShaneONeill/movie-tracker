# PocketStubs Privacy Policy

**Last Updated:** May 28, 2026

## Introduction

PocketStubs ("we," "our," or "us") is a movie and TV tracking application that helps you keep track of films and shows you want to watch, are currently watching, and have watched, alongside a ticket-scanning feature for logging theater visits. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application (iOS, Android) and related web services at pocketstubs.com.

By using PocketStubs, you agree to the collection and use of information in accordance with this policy.

## Information We Collect

### Account Information

When you create an account, we collect:
- Email address
- Password (stored securely using industry-standard hashing by our authentication provider)
- Display name and username (optional)
- Profile photo (optional)
- Short bio (optional)

If you sign in using Google, Apple, or Facebook Sign-In, we receive basic profile information from these services as permitted by your privacy settings with them.

### Content You Create

When you use PocketStubs, we store the content you create:
- Movies and TV shows added to your watchlist, currently watching, or watched lists
- Ratings and written reviews
- "First Takes" — your immediate reactions after watching a film or show
- Custom lists you create
- Movies and shows you mark as liked
- Comments and engagement on your own and others' content

### Theater Visit Data

If you use the ticket scanning feature:
- A photo of your ticket (processed to extract text; see "AI Processing" below)
- Information extracted from the ticket: theater name (free-text, not GPS), movie title, showtime
- Date and time of theater visits

The original ticket photo is sent to our backend for OCR processing and is not retained long-term; only the extracted fields are stored on your account.

### Purchase Information

If you subscribe to PocketStubs Premium:
- We do not receive or store your payment card details. Subscriptions are processed by the Apple App Store, Google Play Store, or — on web — our payments provider, which provide us with a transaction confirmation and a subscription status only.
- We retain a record of your subscription tier and renewal status to gate premium features.

### Usage and Diagnostic Data

We automatically collect certain information when you use the app:
- Device type, model, and operating system version
- App version
- Feature usage events (which screens you visit, which features you use)
- Crash reports and performance data, including stack traces and the state leading up to a crash
- Advertising identifier (IDFA on iOS, AAID on Android) — only if you grant permission via the App Tracking Transparency prompt on iOS

You can disable analytics and crash reporting at any time in **Settings → Privacy**. See "Your Rights and Choices" below.

### Push Notification Tokens

If you grant notification permission, we store a push notification token (an opaque device identifier) so we can send you notifications such as reminders, social interaction alerts, and service updates.

## How We Use Your Information

We use the information we collect to:
- Provide and maintain the PocketStubs service
- Create and manage your account
- Store and display the content you create
- Generate personalized statistics about your viewing habits
- Improve and optimize the app experience based on aggregated usage patterns
- Display relevant advertisements (free tier)
- Diagnose crashes and performance issues
- Send push notifications you have opted into
- Respond to your support requests
- Comply with legal obligations

## Third-Party Services

PocketStubs uses the following third-party services. Each handles a narrow slice of your data for a specific purpose, and is bound by its own privacy policy.

### Supabase
Our backend database and authentication provider. Account data, content, and theater visit metadata are stored on Supabase's infrastructure with encryption in transit and at rest. See the [Supabase Privacy Policy](https://supabase.com/privacy).

### The Movie Database (TMDB)
Used to fetch movie and TV metadata, posters, and trailers. **No personal data is sent to TMDB** — only public title and ID lookups. See the [TMDB Privacy Policy](https://www.themoviedb.org/privacy-policy).

### Google Gemini (AI Processing)
When you scan a ticket, the photo is sent to Google's Gemini API on our backend for optical character recognition (OCR) to extract theater name, movie title, and showtime. The photo is sent over an authenticated server-to-server channel and is not used to train Google's models per Gemini's API terms. See the [Google AI Privacy & Terms](https://ai.google.dev/gemini-api/terms).

### Sentry
We use Sentry for crash and error reporting. Sentry receives crash stack traces, device model, OS version, app version, and a pseudonymous user identifier (the same opaque ID used by our database) — **not your email, name, or content**. You can disable this in Settings → Privacy. See the [Sentry Privacy Policy](https://sentry.io/privacy/).

### PostHog
We use PostHog for product analytics. PostHog receives feature usage events (e.g., "user opened the watchlist", "user submitted a First Take") with a pseudonymous user identifier. You can disable this in Settings → Privacy. See the [PostHog Privacy Policy](https://posthog.com/privacy).

### Google AdMob
On the free tier of the mobile app, we display advertisements via Google AdMob. AdMob may access your advertising identifier (IDFA on iOS, AAID on Android) for ad personalization, **but only after you grant permission via the App Tracking Transparency prompt on iOS**. If you decline, ads are still shown but are non-personalized. See the [Google AdMob & AdSense Privacy Notice](https://support.google.com/admob/answer/6128543).

### Google AdSense (Web Only)
On the web app at pocketstubs.com, we use Google AdSense for display advertisements. AdSense may use cookies for ad personalization, which you can manage via your browser settings.

### RevenueCat
If you subscribe to PocketStubs Premium, we use RevenueCat to coordinate your subscription status across iOS, Android, and web. RevenueCat receives a pseudonymous user identifier and subscription events. See the [RevenueCat Privacy Policy](https://www.revenuecat.com/privacy).

### Expo Push Notifications
We use Expo's push notification infrastructure to deliver notifications to your device. Expo receives the push token and the notification payload. See the [Expo Privacy Policy](https://expo.dev/privacy).

### Expo Updates
We use Expo's over-the-air update mechanism to ship JavaScript bug fixes between native app releases. Expo's update servers receive your app version and runtime version to determine which update (if any) to deliver.

### Authentication Providers
If you choose to sign in with a third-party provider:
- **Google Sign-In:** Subject to [Google's Privacy Policy](https://policies.google.com/privacy)
- **Apple Sign-In:** Subject to [Apple's Privacy Policy](https://www.apple.com/legal/privacy/)
- **Facebook Sign-In:** Subject to [Meta's Privacy Policy](https://www.facebook.com/privacy/policy/). PocketStubs uses OAuth via Supabase and does not embed the native Facebook SDK; only the email and basic profile fields you authorize are returned to us.

We only receive the information you authorize these providers to share — typically email, name, and a stable subject identifier.

## Data Storage and Security

Your data is stored on secure servers provided by Supabase, which employs industry-standard security measures including:
- Encryption in transit (TLS 1.2+)
- Encryption at rest (AES-256)
- Regular security audits
- Row-level security policies that restrict access to your own data
- Access controls and authentication

While we implement safeguards to protect your information, no method of electronic storage is 100% secure. We cannot guarantee absolute security.

## Your Rights and Choices

### Access Your Data
You can view all of your account data, lists, ratings, First Takes, and theater visits within the app at any time.

### Delete Your Account
You can permanently delete your account and all associated data through **Settings → Delete Account**. This action is irreversible and removes:
- Your profile information
- All movie and TV lists and tracking data
- All ratings, reviews, and First Takes
- Theater visit history
- Push notification tokens

We delete your personal information within 30 days of an account deletion request. Backups may take an additional 30 days to expire.

### Opt Out of Analytics and Crash Reporting
Open **Settings → Privacy** to disable PostHog product analytics and/or Sentry crash reporting independently. This takes effect immediately.

### App Tracking Transparency (iOS)
On iOS, you can revoke ad-tracking permission at any time via **iOS Settings → Privacy & Security → Tracking → PocketStubs**.

### Notification Preferences
You can disable push notifications at any time via your operating system's settings, or via the in-app notification settings if available.

### Marketing Communications
We do not send marketing emails. We only send transactional emails (password resets, account confirmations) and important service updates.

### Data Portability
We plan to offer a one-click data export in a future update. In the meantime, if you need an export of your data, contact us at the email below.

## Data Retention

We retain your personal information for as long as your account is active or as needed to provide you services. If you delete your account, we will delete your personal information within 30 days, except where we are required to retain it for legal purposes.

Ticket photos sent to Google Gemini for OCR are processed transiently and are not retained after extraction.

## Children's Privacy

PocketStubs is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can delete such information.

## International Data Transfers

Your information may be transferred to and processed in countries other than your country of residence, including the United States. These countries may have data protection laws that are different from the laws of your country. By using PocketStubs, you consent to the transfer of your information to these countries.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new Privacy Policy at pocketstubs.com/privacy and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.

## Contact Us

If you have questions about this Privacy Policy or our data practices, please contact us at:

**Email:** privacy@pocketstubs.com

**Support:** https://github.com/TyShaneONeill/movie-tracker/issues

---

## Summary of Data Collection

| Data Type | Collected | Purpose | Shared With |
|-----------|-----------|---------|-------------|
| Email | Yes | Account creation, communication | Supabase (storage) |
| Name / Username | Optional | Profile display | Supabase (storage) |
| Profile photo | Optional | Profile display | Supabase (storage) |
| Movie & TV lists | Yes | Core app functionality | Supabase (storage) |
| Ratings / reviews / First Takes | Yes | Core app functionality | Supabase (storage) |
| Ticket photos | Optional (if scanned) | OCR extraction | Google Gemini (transient) |
| Theater visit metadata | Optional | Core app functionality | Supabase (storage) |
| Subscription status | Yes (Premium users) | Premium feature gating | RevenueCat |
| Crash reports | Yes (opt-out available) | Diagnose crashes | Sentry |
| Product analytics events | Yes (opt-out available) | Improve the app | PostHog |
| Advertising identifier (IDFA / AAID) | Optional (iOS ATT) | Ad personalization | Google AdMob |
| Push notification token | Optional | Deliver notifications | Expo Push |
| Device & OS info | Yes | Diagnostics + analytics | Sentry, PostHog |

---

*This privacy policy is effective as of May 28, 2026.*
