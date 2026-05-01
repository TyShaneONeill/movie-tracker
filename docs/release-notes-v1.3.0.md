# PocketStubs v1.3.0 — App Store Release Notes

## What's New (4000-char user-facing version for App Store Connect)

This is our biggest update yet — a full reset of the home screen experience, smarter notifications, and a release calendar that actually keeps up with what's coming out.

**🎬 Home Screen Widget**
PocketStubs now lives on your home screen. See your watchlist, track your current TV shows, and get a peek at upcoming episodes — all without opening the app. Tap the widget to jump straight to a movie or show.

**🗓️ Release Calendar**
A full calendar of upcoming theatrical releases and streaming drops. Filter by your watchlist, swipe between months, and tap into any film for trailers and details. New releases are personalized to what you're already tracking.

**🔔 Smart Notifications**
Get notified when watchlisted movies hit theaters or streaming. Plus brand-new TV episode reminders — we'll tell you when a new episode of a show you're watching drops. Customize what you want to hear about in Settings → Notifications, with a clean master toggle and per-feature controls.

**🐛 Built-In Bug Reporting**
Found something wonky? Shake your phone (yes, really — like an Etch-a-Sketch) to report a bug. We'll take it from there.

**📊 Smarter Stats**
We've reworked how we measure your activity to surface the right insights at the right time.

Plus dozens of smaller fixes and polish: faster tab loading, snappier movie detail pages, web-app stability, and a refreshed onboarding flow. Thanks for being part of PocketStubs.

---

## Internal Changelog (technical detail — not for App Store Connect)

40 PRs since v1.2.0 (`c9abafb` build 27, currently live):

### Major Features

**iOS Home Screen Widget — full feature shipped (~15 PRs)**
- Phase 1 foundation (#381) — extension target, App Group entitlements, basic UI scaffold
- Phase 2 interactivity (#382) — tappable elements, App Intents
- Phase 3 polish + data freshness (#383)
- Phase 4a layout — movie thumbs, featured poster, Q5 hybrid (#384, #385)
- Phase 4b refresh — React Query invalidation, AsyncStorage cache, atomic mark_episode_watched RPC, auto status transitions (#386–#389)
- Phase 4c TV episode catalog — `tv_show_episodes` table, server-side air_date guard, unaired guards, eyeball pulse, proactive next-season badges (#390–#395)

**Bug Reporting System (#400)**
- Modal + iOS shake gesture trigger
- AI triage via Gemini for issue classification

**Release Calendar — SP1-SP4 (~7 PRs)**
- SP1 foundation (#397, #404, #405) — `release_calendar` table, warming worker
- SP2 client cache hierarchy (#401) — persist + prefetch + skeleton
- SP3 UX polish (#402) — month slide transitions
- SP4 my-releases filter (#403) — watchlist-only toggle
- SP4-A enrichment user-driven (#406, #407, #409)
- SP4-C trailer thumbnails (#410)

**Push Notifications Infrastructure (~6 PRs)**
- Release reminders v1 (#411) — daily 14:00 UTC cron, dedup via `push_notification_log`
- pg_net auth fix (#412) — verify_jwt + JWT-decode role check
- cron-auth helper extraction (#413)
- pg_net cron timeout fix (#414) — bump 5s default to 30s for Edge Function cold starts
- TV episode reminders v1 (#416) — mirrors release reminders pattern
- Inter-edge-fn auth fix (#417) — forward inbound auth header (Supabase migrated SUPABASE_SERVICE_ROLE_KEY env to new sb_secret_* format)
- Master toggle UX (#418) — Apple-standard master + per-feature toggles in Settings → Notifications

**Activation Funnel Analytics (#415)**
- New PostHog events: `onboarding:complete`, `review:create`, `scan:bonus_granted`
- Person property `onboarding_completed: true`
- Skip button removed from onboarding flow
- Onboarding flash redirect guard added
- console.error → captureException in scanner rewarded-ad path

### Smaller Fixes
- get-tv-show-details wrapper shape (#393)
- Web WidgetBridge guard for white-screen crash (#399)
- AdSense web disclosure + ads.txt (#396)
- npm audit fix for @xmldom/xmldom CVEs (#398)
- Hide Popcorn tab from bottom nav (#372)
- iOS buildNumber autoincrement removed (#373)
- TV watch time drilldown — in-progress shows included (#377)
- Tablet landscape layout — ContentContainer + 720px max-width across 30+ screens (#379)

---

## Test Plan for App Store Reviewer

Steps to demonstrate the new features (for App Store Connect "Notes for Reviewer"):

1. **Open the app** → onboarding flow completes (no Skip button — that was a UX cleanup in 1.3.0)
2. **Tap Calendar tab** → see upcoming releases. Toggle "My releases" filter to see only watchlisted movies
3. **Tap any TV show** → mark episodes as watched, view next episode info
4. **Add the home screen widget** (long-press home screen → +  → search "PocketStubs") — see watchlist + tracked shows
5. **Settings → Notifications** → tap Push Notifications master toggle → grant iOS permission → enable Release reminders or TV episode reminders
6. **Shake the phone** anywhere in the app → bug report modal appears

No login required for browsing; sign-in via Apple ID, Google, or email gives full feature access.
