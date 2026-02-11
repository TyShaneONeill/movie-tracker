# PRD: Ads Integration

## Overview
Integrate Google AdMob to monetize the free tier of CineTrak with tasteful, non-intrusive ads. Build infrastructure to easily toggle ads off for premium members (future) and developers.

## Goals
- Generate revenue from free users
- Keep UX clean — no ads during key actions (adding movies, First Takes)
- Prepare for premium tier that removes ads
- Easy toggle for devs/testing

---

## Ad Placements

### 1. Home Screen Banner
**Location:** Below "Coming Soon" section, above "Activity" section
**Type:** Banner (320x50 or adaptive)
**Frequency:** Always visible when scrolled into view

### 2. Search Screen Banner
**Location:** Bottom of screen (fixed) or below search results
**Type:** Banner (320x50 or adaptive)
**Frequency:** Always visible

### 3. Activity Feed Native Ad
**Location:** Inline with First Takes in the activity feed
**Type:** Native ad (matches First Take card styling)
**Frequency:** Every 20-40 First Takes (configurable)
**Note:** Should look like content, not disruptive

### 4. Stats Page Banner
**Location:** Bottom of Stats/Analytics screen
**Type:** Banner (320x50 or adaptive)
**Frequency:** Always visible

### 5. Rewarded Video for Extra Scans
**Location:** Ticket scan screen when limit reached
**Type:** Rewarded video
**Trigger:** User taps "Watch ad for extra scan"
**Reward:** +1 ticket scan

---

## Where NOT to Show Ads
- ❌ During "Add to Watchlist" flow
- ❌ During First Take creation
- ❌ On Movie Detail page (keep it clean)
- ❌ During onboarding
- ❌ Profile/Settings screens

---

## Technical Architecture

### Package
`react-native-google-mobile-ads` (Google AdMob SDK)

### Ad Toggle System
Create a context/hook for controlling ad visibility:

```typescript
// lib/ads-context.tsx
interface AdsContextType {
  adsEnabled: boolean;
  showBannerAds: boolean;
  showNativeAds: boolean;
  showRewardedAds: boolean;
}
```

**Toggle conditions:**
- `adsEnabled = false` if user is premium (future)
- `adsEnabled = false` if `__DEV__` mode (optional, for testing)
- Can be controlled via remote config (future)

### Ad Unit IDs
Store in environment/config:
```
ADMOB_BANNER_HOME=ca-app-pub-xxxxx/xxxxx
ADMOB_BANNER_SEARCH=ca-app-pub-xxxxx/xxxxx
ADMOB_BANNER_STATS=ca-app-pub-xxxxx/xxxxx
ADMOB_NATIVE_FEED=ca-app-pub-xxxxx/xxxxx
ADMOB_REWARDED_SCAN=ca-app-pub-xxxxx/xxxxx
```

Use test IDs during development.

### Components to Create
1. `components/ads/BannerAd.tsx` — Reusable banner wrapper
2. `components/ads/NativeFeedAd.tsx` — Native ad styled like First Take
3. `components/ads/RewardedAdButton.tsx` — "Watch ad" button with reward handling
4. `lib/ads-context.tsx` — Ad toggle context
5. `hooks/use-rewarded-ad.ts` — Hook for rewarded video logic

---

## Implementation Phases

### Phase 1: Setup & Banner Ads
- [ ] Install `react-native-google-mobile-ads`
- [ ] Configure AdMob app ID in app.json
- [ ] Create AdsContext with toggle system
- [ ] Create BannerAd component
- [ ] Add banner to Home screen
- [ ] Add banner to Search screen
- [ ] Add banner to Stats screen

### Phase 2: Rewarded Video
- [ ] Create RewardedAdButton component
- [ ] Integrate with ticket scan limit
- [ ] Grant +1 scan on successful watch
- [ ] Handle ad load failures gracefully

### Phase 3: Native Feed Ads
- [ ] Create NativeFeedAd component (matches First Take styling)
- [ ] Integrate into Activity feed every 20-40 items
- [ ] Test scroll performance

---

## AdMob Setup Required
1. Create AdMob account (https://admob.google.com)
2. Create app in AdMob console
3. Create ad units for each placement
4. Get App ID for iOS/Android
5. Get test device IDs for development

---

## Premium Tier Prep
The ads system should check a user flag:
```typescript
const { isPremium } = useUser();
const showAds = !isPremium && !__DEV__;
```

When premium tier launches, just set `isPremium = true` for subscribers.

---

## Success Metrics
- Ad revenue per DAU
- Ad load success rate
- User retention (make sure ads don't hurt it)
- Premium conversion (if ads drive upgrades)

---

## References
- [react-native-google-mobile-ads docs](https://docs.page/invertase/react-native-google-mobile-ads)
- [AdMob policies](https://support.google.com/admob/answer/6128543)
- [Expo custom dev client](https://docs.expo.dev/develop/development-builds/introduction/) (required for native ads)
