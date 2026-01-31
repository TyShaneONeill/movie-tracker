# PRD: Monetization Strategy - Ads & Premium

## Overview
Implement a sustainable revenue model for CineTrak through tasteful advertising and a premium subscription tier.

---

## Letterboxd Model Analysis

### Their Tiers
| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Unlimited films, diary, reviews, ratings, lists. Has third-party ads. |
| **Pro** | $19.99/year | No ads, personalized stats, streaming service filters, custom app icons |
| **Patron** | $49.99/year | Everything in Pro + custom posters/backdrops, beta access, name on patrons page |

### Key Insights
- Free tier is **fully functional** — no feature walls for core experience
- Ads are the main pain point that drives upgrades
- Pro is the sweet spot (~$1.67/month)
- Patron is for superfans who want to support + get cosmetic perks

---

## CineTrak Monetization Plan

### Tier Structure

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Full functionality, 3 ticket scans/month, has ads |
| **CineTrak+** | $19.99/year (~$1.67/mo) | No ads, unlimited scans, advanced stats, AI ticket art (3/month) |
| **CineTrak Pro** | $39.99/year (~$3.33/mo) | Everything in Plus + unlimited AI art, early features, custom themes |

### Feature Breakdown

#### Free Tier
- ✅ Unlimited movies, watchlists, First Takes
- ✅ Basic stats (total watched, recent activity)
- ✅ 3 ticket scans per month
- ❌ Shows ads (banner + occasional interstitial)
- ❌ No AI ticket art

#### CineTrak+ ($19.99/year)
- ✅ Everything in Free
- ✅ **No ads**
- ✅ Unlimited ticket scans
- ✅ Advanced stats (year in review, genre breakdown, time watched)
- ✅ AI Ticket Art (3 per month)
- ✅ Streaming service filters (where to watch)
- ✅ Custom app icons

#### CineTrak Pro ($39.99/year)
- ✅ Everything in CineTrak+
- ✅ **Unlimited AI Ticket Art**
- ✅ Custom profile themes
- ✅ Early access to new features
- ✅ Priority support
- ✅ Name in credits/supporters page

---

## Advertising Implementation

### Ad Networks to Evaluate

| Network | Pros | Cons |
|---------|------|------|
| **Google AdMob** | Largest, reliable, good fill rates | Generic ads, Google dependency |
| **Meta Audience Network** | Good targeting, social context | Requires Meta SDK |
| **Unity Ads** | Good for engagement | More gaming-focused |
| **AppLovin** | High CPMs | Can be intrusive |

**Recommendation:** Start with **AdMob** for reliability and coverage.

### Ad Placements (Tasteful)

1. **Banner Ad (Bottom)** - Persistent small banner on main screens
   - Home screen (below First Takes)
   - Search screen
   - Profile screen
   - **NOT** on movie detail or during scanning

2. **Interstitial (Occasional)** - Full screen between actions
   - After completing onboarding
   - After scanning 3rd free ticket
   - After every 10 movies logged
   - **Max 1 per session, minimum 5 min between**

3. **Native Ads (Blended)** - In-feed style
   - In First Takes feed (every 10 items)
   - Styled to match app aesthetic

### Ad-Free Zones (Never Show Ads)
- During ticket scanning flow
- Movie detail screen
- While writing First Takes
- Settings screens
- Error/loading states

### Implementation Notes

```typescript
// Ad frequency caps
const AD_CONFIG = {
  interstitial: {
    maxPerSession: 1,
    minSecondsBetween: 300, // 5 minutes
    triggers: ['onboarding_complete', 'scan_limit_reached', 'movies_logged_10']
  },
  banner: {
    screens: ['home', 'search', 'profile'],
    excludeScreens: ['movie_detail', 'scanning', 'first_take_editor']
  },
  native: {
    feedInterval: 10 // Every 10 First Takes
  }
};
```

---

## Subscription Implementation

### Tech Stack
- **RevenueCat** - Handles IAP, subscription management, analytics
- Apple StoreKit 2 / Google Play Billing via RevenueCat
- Supabase stores subscription status for server-side checks

### Database Schema

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN subscription_tier TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN ticket_scans_this_month INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN ticket_scans_reset_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN ai_art_this_month INT DEFAULT 0;
```

### RevenueCat Setup

1. Create products in App Store Connect:
   - `cinetrak_plus_yearly` - $19.99
   - `cinetrak_pro_yearly` - $39.99
   - (Optional) Monthly options

2. Configure RevenueCat:
   - Set up offerings
   - Configure entitlements
   - Add webhook to Supabase Edge Function

3. Client integration:
```typescript
import Purchases from 'react-native-purchases';

// Initialize
Purchases.configure({ apiKey: REVENUECAT_API_KEY });

// Check subscription
const customerInfo = await Purchases.getCustomerInfo();
const isPlus = customerInfo.entitlements.active['plus'];
const isPro = customerInfo.entitlements.active['pro'];

// Purchase
await Purchases.purchasePackage(selectedPackage);
```

---

## Paywall UX

### When to Show Upgrade Prompt

1. **Soft prompts** (dismissible):
   - First ad shown: "Upgrade to remove ads"
   - Viewing advanced stats: "Unlock full stats with CineTrak+"
   - 3rd ticket scan: "You've used your free scans. Upgrade for unlimited!"

2. **Hard gates** (must upgrade):
   - 4th+ ticket scan in a month
   - AI Ticket Art feature
   - Custom themes

### Paywall Screen Design

```
┌─────────────────────────────────┐
│     🎬 Upgrade to CineTrak+     │
│                                 │
│  ✓ No ads                       │
│  ✓ Unlimited ticket scans       │
│  ✓ Advanced stats               │
│  ✓ AI Ticket Art (3/month)      │
│                                 │
│  ┌─────────────────────────┐    │
│  │  $19.99/year            │    │
│  │  Just $1.67/month       │    │
│  └─────────────────────────┘    │
│                                 │
│  [ Upgrade Now ]                │
│                                 │
│  Restore Purchases              │
└─────────────────────────────────┘
```

---

## Pricing Psychology

- **Yearly pricing** shown prominently (better value perception)
- **Per-month equivalent** shown to make it feel cheaper
- **Free trial** option: 7-day free trial of Plus
- **Patron/Pro** positioned as "support the indie dev" angle

---

## Launch Phases

### Phase 1: Launch Free (Current)
- No ads, no subscriptions
- Gather users, get feedback
- Track which features are most loved

### Phase 2: Add Ads (1-2 months post-launch)
- Implement AdMob
- Tasteful placements only
- Monitor user feedback

### Phase 3: Add Subscriptions (2-3 months post-launch)
- Implement RevenueCat
- Launch CineTrak+ and Pro
- Offer launch discount (50% off first year?)

### Phase 4: Add AI Ticket Art (3-4 months post-launch)
- Premium exclusive feature
- Major differentiator

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Ad revenue per DAU | $0.01-0.05 |
| Free → Plus conversion | 2-5% |
| Plus → Pro upsell | 10-20% of Plus |
| Churn rate | <5% monthly |

---

## Open Questions

1. Should we offer monthly subscription option or yearly only?
2. Free trial: 3 days, 7 days, or no trial?
3. Grandfather early users with any perks?
4. Regional pricing for international markets?

---

## Timeline

| Task | Estimate |
|------|----------|
| AdMob integration | 4-6 hours |
| RevenueCat setup | 4-6 hours |
| Paywall UI | 4-6 hours |
| Subscription status logic | 4-6 hours |
| Testing (sandbox purchases) | 4 hours |
| **Total** | **~20-30 hours** |
