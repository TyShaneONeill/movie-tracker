# PRD: Social Share for Reviews & Ticket Stubs

## Overview

Let users share their reviews and digital ticket stubs as image cards
to social media (Instagram Stories, X, etc.) via the native share
sheet, with a deep link back to the Pocketstubs app or web page.

Source: Testers Community feedback report (2026-05), additional
recommendation "Social Media Integration."

---

## Problem Statement

Pocketstubs has two highly shareable assets: the ticket stub view and
user reviews. Today neither has a Share button, so users who want to
post their take or their collection have to screenshot and crop
manually, which kills viral loops.

---

## Goals

### Primary Goals
1. One-tap Share from review and stub detail screens.
2. Branded image card (logo, app handle, deep link) so shares drive
   discovery.
3. Deep link opens the specific review / stub in the app, or a web
   fallback if the app isn't installed.

### Success Metrics
- Share-to-install conversion (tracked via deep link attribution).
- Daily shares per active user.
- Increase in unattributed installs on weeks with high share volume.

---

## Feature Requirements

### P0 - Must Have
- [ ] Share button on review detail screen.
- [ ] Share button on ticket stub detail screen.
- [ ] Image card generation (e.g., `react-native-view-shot` or Skia)
      capturing a branded version of the asset.
- [ ] Native share sheet (`expo-sharing`) presents the image + a deep
      link URL.
- [ ] Deep link format: `pocketstubs://review/{id}` and
      `pocketstubs://stub/{id}`, with universal-link / app-link
      fallback to the web URL.
- [ ] Web fallback page for users without the app installed.

### P1 - Should Have
- [ ] Multiple card templates (e.g., light / dark, square / story).
- [ ] Watermark / logo position configurable for premium users.
- [ ] Telemetry on which surface was shared and which template was
      used.

### P2 - Nice to Have
- [ ] In-app preview-before-share screen with card customisation.
- [ ] Direct posting integrations (Instagram Stories sticker API,
      etc.) - per-platform work, defer.

### Out of Scope
- Server-side card rendering (OG-image style) - revisit if web sharing
  becomes primary.
- Cross-posting to a Pocketstubs-native feed.

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

- iOS Universal Links + Android App Links already need a verified
  `apple-app-site-association` / `assetlinks.json` on the web host.
  Confirm whether the marketing site (web app in
  `pocketstubs-vault` or similar) is set up for this.
- Web fallback page must render the same review / stub server-side or
  with hydration so previews on social platforms look good.

### Sharing

```ts
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

const uri = await viewShotRef.current.capture();
await Sharing.shareAsync(uri, {
  dialogTitle: 'Share your stub',
  mimeType: 'image/png',
});
```

Note: native share sheet on iOS allows only one item (file OR URL). To
share both, we'll bake the short URL into the card image and copy the
full link to the clipboard as a fallback.

---

## Privacy & Security

- Card uses public-facing data only (review text + movie poster +
  username if user opted into public profile).
- Private reviews cannot be shared.
- Stubs containing scanned PII (confirmation numbers etc.) are
  masked in the card.

---

## User Flow

1. User opens a review or stub detail.
2. Tap Share -> off-screen view captures into an image.
3. Native share sheet opens with the image and copied link.
4. Recipient taps link -> if app installed, opens that review / stub;
   if not, web page with install prompt.

---

## Open Questions

1. Web target: does `pocketstubs-vault` or `pocketstubs-social-agent`
   host the marketing / share-landing site? This PRD assumes one exists
   - confirm before starting.
2. Should sharing a *private* review prompt the user to make it public,
   or refuse silently? Recommend refusal with explanatory copy.
3. Watermark behaviour for free vs premium - product call.

---

## Implementation Phases

### Sprint 1: Spike
- [ ] Confirm web fallback host + universal link setup.
- [ ] Pick rendering library.

### Sprint 2: Cards + share sheet
- [ ] Build review share card.
- [ ] Build stub share card.
- [ ] Wire share buttons.

### Sprint 3: Web fallback + attribution
- [ ] Web page for each entity.
- [ ] Deep-link install attribution.

### Sprint 4: Polish
- [ ] Multiple templates.
- [ ] Telemetry.

---

*Last Updated: 2026-05-24*
*Status: Draft - blocked on web deep-link target*
