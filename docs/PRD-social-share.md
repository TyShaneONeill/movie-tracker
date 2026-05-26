# PRD: Social Share for Reviews, First Takes, and Discovery

## Overview

Let users share their reviews, First Takes, and discovery content
(movies and TV shows) as image cards to social media (Instagram
Stories, X, etc.) via the native share sheet, with a deep link back to
the PocketStubs app or web fallback page.

Source: Testers Community feedback report (2026-05), additional
recommendation "Social Media Integration."

---

## Problem Statement

PocketStubs has several highly shareable surfaces: reviews, First
Takes (immediate reactions), and the movie/TV detail screens that
power discovery. Today none have a Share button, so users who want to
post their take or recommend something they're watching have to
screenshot and crop manually, which kills viral loops.

Ticket stubs are also highly shareable in principle, but carry
theater-location PII that makes public broadcast risky. Stub sharing
is deferred to v2 — see the "Deferred to v2" section below.

---

## Goals

### Primary Goals
1. One-tap Share from the four v1 surfaces: Review detail, First Take
   detail, Movie detail, and TV detail.
2. Branded image card (logo, app handle where relevant, deep link) so
   shares drive discovery.
3. Deep link opens the specific entity in the app, or a web fallback
   page on `pocketstubs.com` if the app isn't installed.

### Success Metrics
- Share-to-install conversion (tracked via deep link attribution)
  across the four v1 surfaces.
- Daily shares per active user, segmented by surface (Review / First
  Take / Movie / TV).
- Increase in unattributed installs on weeks with high share volume.

---

## Feature Requirements

### P0 - Must Have (v1 Share Surfaces)

The four shareable surfaces in v1, each with its own share button and
its own card template:

1. **Review detail screen** — user-authored review of a movie/show.
2. **First Take detail screen** — user's raw, immediate reaction
   (separate from Review, separately shareable).
3. **Movie detail screen** — discovery share (TMDB-sourced movie
   metadata).
4. **TV show detail screen** — discovery share (TMDB-sourced show
   metadata).

P0 requirements:

- [ ] Share button on Review detail screen.
- [ ] Share button on First Take detail screen.
- [ ] Share button on Movie detail screen.
- [ ] Share button on TV show detail screen.
- [ ] Image card generation (`react-native-view-shot`, see Technical
      Considerations) capturing a branded version of the asset.
- [ ] Native share sheet (`expo-sharing`) presents the image + a deep
      link URL.
- [ ] Deep link formats:
      `pocketstubs://review/{id}`,
      `pocketstubs://firsttake/{id}`,
      `pocketstubs://movie/{id}`,
      `pocketstubs://tv/{id}`,
      with universal-link / app-link fallback to the web URL on
      `pocketstubs.com`.
- [ ] Web fallback pages at `pocketstubs.com/review/{id}`,
      `pocketstubs.com/firsttake/{id}`, `pocketstubs.com/movie/{id}`,
      `pocketstubs.com/tv/{id}`.
- [ ] Private-content guard: tapping Share on a Private Review or
      First Take refuses with explanatory copy (see Privacy & Security).

### Card Template Families

Two families of card template, one per content type:

- **User-authored cards** (Review, First Take): show the user's
  @handle, their take (review body or First Take text), the
  movie/show poster + title, and a "PocketStubs" tag. Personal
  content.
- **Discovery cards** (Movie, TV): show only the movie/show poster +
  title + a small "On PocketStubs" tag. **No user data leaks.** Pure
  discovery — anyone can share regardless of account state.

### P1 - Should Have
- [ ] Multiple card templates (e.g., light / dark, square / story).
- [ ] Telemetry on which surface was shared and which template was
      used.

### P2 - Nice to Have
- [ ] In-app preview-before-share screen with card customisation.
- [ ] Direct posting integrations (Instagram Stories sticker API,
      etc.) - per-platform work, defer.
- [ ] A/B test card variants.

### Out of Scope (v1)
- **Ticket stub sharing** — deferred to v2, see dedicated section
  below.
- Premium-tier card differences / watermark gating — see Open
  Questions resolution. Revisit post-launch once we have share-volume
  data.
- Server-side card rendering (OG-image style) — revisit if web
  sharing becomes primary.
- Cross-posting to a PocketStubs-native feed.

---

## Deferred to v2: Ticket Stub Sharing

Ticket stubs contain theater location data (and other PII like
confirmation numbers). A publicly-broadcast share of a stub to
Twitter / Instagram would let anyone correlate a user's identity with
their movie-going location history, which is a meaningful privacy
risk. v1 ships without stub sharing.

v2 will revisit stub sharing as a **direct send to mutual followers
only** (not a public broadcast). This depends on the existing follow
system being formalized as a "friends" relationship (mutual-follow =
friends). Stub sharing is therefore blocked on:

- A friend-confirmation UX.
- A private-share-recipient model (direct-send, not broadcast).

Neither exists today. The existing `follows` / `follow_counts`
infrastructure (per `supabase/migrations-archive/`) will serve as the
friends relationship — mutual follow = friends. Do not build a
parallel "friends" concept layered on top.

---

## Technical Considerations

### Card rendering

Two approaches:

| Option | Pros | Cons |
|--------|------|------|
| `react-native-view-shot` on an off-screen `<View>` | Simple, uses existing UI components | Output quality varies on Android |
| Skia (`@shopify/react-native-skia`) | Pixel-perfect, fast | Higher learning curve, larger bundle |

**Recommendation:** start with `react-native-view-shot`; revisit if
quality / consistency becomes a complaint.

### Deep linking

- iOS Universal Links + Android App Links require a verified
  `apple-app-site-association` / `assetlinks.json` on the web host
  (`pocketstubs.com`). A parallel investigation is determining which
  existing repo currently serves `pocketstubs.com` — that's tracked
  but not blocking this PRD; flag as a Sprint 1 spike output.
- Web fallback pages must render the same content as the in-app
  screen, server-side or with hydration, so previews on social
  platforms look good.

### Sharing

```ts
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

const uri = await viewShotRef.current.capture();
await Sharing.shareAsync(uri, {
  dialogTitle: 'Share',
  mimeType: 'image/png',
});
```

Note: native share sheet on iOS allows only one item (file OR URL). To
share both, we'll bake the short URL into the card image and copy the
full link to the clipboard as a fallback.

### Web fallback CTA

Each `pocketstubs.com/{review|firsttake|movie|tv}/{id}` page renders
the same content as the in-app screen plus a prominent "Get
PocketStubs" CTA block with:

- iOS App Store button
- Google Play button
- "Use the web app" button

This serves Persons B (non-installer recipients) and C (desktop
visitors).

---

## Privacy & Security

- **Ticket stubs are out of v1** because of the theater-PII risk
  described in the "Deferred to v2" section. They do not get a share
  button at all in v1.
- **Reviews and First Takes respect existing visibility settings.**
  Tapping Share on a Private Review or First Take refuses with
  explanatory copy nudging the user to change visibility themselves.
  We do not auto-prompt to flip visibility, and we do not
  share-with-warning — only the user can change their own privacy
  intent. Copy direction (not final):
  > "This [review|first take] is private. Change visibility to
  > Friends or Public in settings to share it."
- **Movie and TV discovery cards have no user data on them** — only
  the TMDB-sourced poster, title, and an "On PocketStubs" tag. They
  carry no privacy risk and require no special gating.

---

## User Flow

1. User opens a Review, First Take, Movie, or TV detail screen.
2. Tap Share.
   - If the surface is a Private Review or First Take, show the
     refusal copy and stop.
   - Otherwise, off-screen view captures into an image using the
     appropriate card template (user-authored or discovery).
3. Native share sheet opens with the image and copied deep link.
4. Recipient taps link → if app installed, opens that entity; if not,
   `pocketstubs.com/{surface}/{id}` web page with install CTA.

---

## Open Questions

1. **Web target: which host serves `pocketstubs.com`?** — **ANSWERED.**
   Web fallback pages live on `pocketstubs.com` at the URL structure
   above. A parallel investigation is determining which existing repo
   serves `pocketstubs.com` today; implementation host is TBD and
   tracked but not blocking this doc.
2. **Should sharing a *private* review prompt the user to make it
   public, or refuse silently?** — **ANSWERED.** Refuse with
   explanatory copy nudging the user to change visibility to Friends
   or Public themselves. Do not auto-prompt to flip visibility, do
   not share-with-warning. Respect existing user privacy intent —
   only the user can change visibility.
3. **Watermark behaviour for free vs premium.** — **ANSWERED.** All
   users get the same card in v1. No premium-tier differences.
   Revisit premium gating in a future iteration once the feature has
   shipped and we have data on share volume.

---

## Implementation Phases

### Sprint 1: Spike — COMPLETE (2026-05-26)
- [x] Confirm web host for `pocketstubs.com` — **this repo**
      (movie-tracker), deployed to Vercel. Apex + www both connected to
      Production environment; do not reintroduce an apex→www
      redirect — it breaks Universal Links / App Links because Apple's
      CDN and Android's verifier do not follow cross-host redirects
      when fetching `.well-known/` association files.
- [x] Rendering library — `react-native-view-shot@4.0.3` and
      `expo-sharing@~14.0.8` are already in `package.json`.
      `@shopify/react-native-skia@2.2.12` is also installed and
      available as a fallback if view-shot output quality regresses on
      Android.
- [x] Deep-link URL scheme + iOS Associated Domains + Android App
      Links entitlements — wired in `app.config.js:13,26,66-83` (#486).
      `.well-known/apple-app-site-association` and
      `.well-known/assetlinks.json` now serve `200` directly from the
      apex, and `vercel.json` pins the AASA `Content-Type` to
      `application/json` (the file is extensionless, so Vercel's
      MIME inference would otherwise emit `application/octet-stream`).
      Verified live with `swcutil dl -d pocketstubs.com`.

### Sprint 2: Mobile
- [ ] Build the four card templates (Review, First Take, Movie, TV)
      across the two families (user-authored, discovery).
- [ ] Wire share buttons on the four surfaces (Review detail, First
      Take detail, Movie detail, TV detail).
- [ ] Native share sheet integration.
- [ ] Private-content refusal copy + guard for Review / First Take.

### Sprint 3: Web fallback + attribution
- [ ] Build `/review/{id}`, `/firsttake/{id}`, `/movie/{id}`,
      `/tv/{id}` pages on the web host.
- [ ] "Get PocketStubs" CTA block (App Store / Google Play / web app)
      on each.
- [ ] Share-to-install attribution.

### Sprint 4: Polish
- [ ] Multiple card templates (light/dark, square/story).
- [ ] Telemetry on which surface was shared.
- [ ] A/B test card variants if time permits.

### v2 (post-launch)
- Revisit stub sharing with the friend-gated direct-send flow
  (mutual-follow = friends, no public broadcast). See "Deferred to
  v2" section.

---

*Last Updated: 2026-05-26*
*Status: Sprint 1 complete — ready for Sprint 2 (mobile)*
