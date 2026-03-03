# PRD: Premium Gating UX & Subscription Infrastructure

**Version**: 1.0
**Date**: March 3, 2026
**Status**: Draft
**Author**: Product Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Stories](#2-user-stories)
3. [Premium Tier Definition](#3-premium-tier-definition)
4. [Revenue Provider Integration](#4-revenue-provider-integration)
5. [Database Schema](#5-database-schema)
6. [Client-Side Architecture](#6-client-side-architecture)
7. [Premium Feature Registry](#7-premium-feature-registry)
8. [UI/UX Specification](#8-uiux-specification)
9. [Edge Function: Server-Side Validation](#9-edge-function-server-side-validation)
10. [Settings Screen Additions](#10-settings-screen-additions)
11. [UX Flows](#11-ux-flows)
12. [Error Handling & Edge Cases](#12-error-handling--edge-cases)
13. [Implementation Phases](#13-implementation-phases)
14. [Success Metrics](#14-success-metrics)
15. [Future Considerations](#15-future-considerations)

---

## 1. Overview

### 1.1 Feature Summary

The **Premium Gating UX & Subscription Infrastructure** is a standalone, reusable system that gates features across the entire CineTrak app behind a paid subscription tier. It provides a consistent, tasteful upgrade experience — visible lock indicators, contextual bottom-sheet prompts, and a centralized premium feature registry — so that any current or future feature can be premium-gated with minimal code.

### 1.2 Core Philosophy

- **Visible but locked, never hidden** — Free users see premium features with a lock indicator. They can discover and understand the value before being asked to pay. Nothing is removed from the UI.
- **Tasteful upgrade prompts** — Prompts are contextual (tied to the specific feature the user tried to use), brief, and always dismissible. No nagging, no countdown timers, no dark patterns.
- **Core experience always free** — Movie browsing, watchlists, First Takes, basic stats, the calendar, social feed — all remain fully usable without payment. Premium is for power-user enhancements.
- **Single source of truth** — The `usePremium()` hook is the only way to check premium status across the entire app. No scattered `if (isPremium)` checks against raw profile data.
- **Store-agnostic by default** — RevenueCat abstracts away App Store and Play Store differences. The app code never talks to StoreKit or Google Play Billing directly.

### 1.3 Current State Analysis

#### What Already Exists

| Component | File Path | Status |
|-----------|-----------|--------|
| `account_tier` column on profiles | `lib/database.types.ts` (line 439) | Exists — values: `'free'`, `'premium'`, `'dev'` |
| `tier_expires_at` column on profiles | `lib/database.types.ts` (line 456) | Exists — nullable timestamptz |
| Tier-aware scan limits | `hooks/use-scan-ticket.ts` (line 428) | Exists — `'dev'` = 999, `'premium'` = 20, `'free'` = 3 |
| Ads context with premium prep | `lib/ads-context.tsx` (line 29) | Exists — comment: `"Future: also disable for premium users"` |
| Auth gating pattern (`useRequireAuth`) | `hooks/use-require-auth.ts` | Exists — reusable hook + `LoginPromptModal` bottom sheet |
| Login prompt modal (bottom sheet) | `components/modals/login-prompt-modal.tsx` | Exists — template for upgrade prompt sheet |
| Guest sign-in prompt | `components/guest-sign-in-prompt.tsx` | Exists — full-screen prompt pattern |
| AdMob integration | `lib/ads-context.tsx`, `components/ads/` | Exists — banner, native feed, rewarded ads |
| Monetization strategy PRD | `.claude/prds/006-monetization-ads-premium.md` | Exists — defines CineTrak+/Pro tiers, RevenueCat plan |
| Context provider pattern | `app/_layout.tsx` | Exists — nested providers: Query > Network > Ads > Guest > Auth > Onboarding > Theme > Achievement |
| `@gorhom/bottom-sheet` dependency | `package.json` (line 26) | Installed — `^5.2.8` |
| Settings screen with sections | `app/settings/index.tsx` | Exists — Account, App Preferences, Integrations, Legal sections |
| Rate limit shared utility | `supabase/functions/_shared/rate-limit.ts` | Exists — reusable pattern for premium-aware rate limits |
| Bundle identifier | `app.config.js` (line 13) | `com.cinetrak.app` |
| EAS project ID | `app.config.js` (line 91) | `ecccbab0-48e5-4c5c-b830-f14131408a69` |

#### What Needs to Be Built

| Component | Description |
|-----------|-------------|
| `PremiumContext` / `usePremium()` hook | Context provider + hook for checking premium status app-wide |
| `PremiumGate` wrapper component | Wraps any premium UI, shows lock overlay for free users |
| `UpgradePromptSheet` | Bottom sheet with feature-specific messaging and purchase CTA |
| `PremiumBadge` component | Inline lock/crown icon for use next to feature labels |
| `lib/premium-service.ts` | Service layer for checking/syncing subscription status |
| `subscriptions` table | Detailed subscription tracking (store transactions, receipt data) |
| `validate-subscription` edge function | Webhook endpoint for RevenueCat server-to-server events |
| RevenueCat SDK integration | `react-native-purchases` setup with Expo config plugin |
| Settings: Subscription section | Subscription status, manage, restore purchases in Settings |
| Premium feature registry | Centralized map of feature keys to metadata |
| Paywall/upgrade screen | Full-screen upgrade experience with tier comparison |

---

## 2. User Stories

### 2.1 Free Users

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a free user, I want to see premium features with a clear lock indicator so I understand what extra value is available | P0 |
| US-2 | As a free user, I want to tap a locked feature and see a brief, contextual explanation of what it does and how to unlock it | P0 |
| US-3 | As a free user, I want to dismiss the upgrade prompt easily and continue using the app without friction | P0 |
| US-4 | As a free user, I want to see the full premium value proposition on a dedicated upgrade screen before committing | P0 |
| US-5 | As a free user, I want a free trial option so I can try premium features before paying | P1 |
| US-6 | As a free user, I want ads to be the primary pain point that motivates upgrading, not feature walls | P1 |

### 2.2 Premium Users

| ID | Story | Priority |
|----|-------|----------|
| US-7 | As a premium user, I want all premium features unlocked immediately after purchase with a celebration moment | P0 |
| US-8 | As a premium user, I want no ads anywhere in the app | P0 |
| US-9 | As a premium user, I want to see my subscription status and expiry date in Settings | P0 |
| US-10 | As a premium user, I want to manage my subscription (cancel, change plan) from within the app | P1 |
| US-11 | As a premium user, I want to restore my purchases if I reinstall the app or switch devices | P0 |
| US-12 | As a premium user, I want my premium status to sync across iOS and Android if I use both | P1 |

### 2.3 Developer / Ops

| ID | Story | Priority |
|----|-------|----------|
| US-13 | As a developer, I want to gate any feature behind premium with a single `<PremiumGate>` wrapper or `usePremium()` check | P0 |
| US-14 | As a developer, I want to add a new premium feature by adding one entry to the feature registry | P0 |
| US-15 | As a developer, I want server-side premium validation for sensitive operations (AI art, unlimited scans) | P0 |
| US-16 | As a developer, I want subscription events from RevenueCat to sync to our database automatically via webhook | P0 |

---

## 3. Premium Tier Definition

### 3.1 Tier Structure

Based on the existing monetization strategy (`.claude/prds/006-monetization-ads-premium.md`) and the release calendar PRD's freemium boundaries:

| Tier | Price | Billing |
|------|-------|---------|
| **Free** | $0 | — |
| **CineTrak+** | $19.99/year or $2.99/month | Auto-renewable subscription |
| **CineTrak Pro** | $39.99/year or $4.99/month | Auto-renewable subscription |

### 3.2 Feature Matrix

This is the **universal** feature matrix. Individual feature PRDs reference this as the source of truth.

| Feature | Free | CineTrak+ | CineTrak Pro |
|---------|------|-----------|--------------|
| **Core Experience** | | | |
| Browse movies, TV shows, search | Yes | Yes | Yes |
| Watchlists and watched tracking | Yes | Yes | Yes |
| First Takes (reviews) | Yes | Yes | Yes |
| Social feed, follow users | Yes | Yes | Yes |
| Movie/TV detail pages | Yes | Yes | Yes |
| Release calendar (browse, basic filters) | Yes | Yes | Yes |
| Watchlist highlights on calendar | Yes | Yes | Yes |
| Basic taste-match indicators | Yes | Yes | Yes |
| **Ads** | | | |
| Banner and native feed ads | Yes | No | No |
| Rewarded ads (bonus scans) | Yes | No | No |
| **Ticket Scanning** | | | |
| Daily ticket scans | 3/day | 20/day | 20/day |
| Bonus scans via rewarded ads | Yes | N/A | N/A |
| **Calendar — Advanced** | | | |
| Release reminders (push notifications) | No | Yes | Yes |
| Genre filter on calendar | No | Yes | Yes |
| "My platforms only" filter | No | Yes | Yes |
| "Personalized only" toggle | No | Yes | Yes |
| Follow actors/directors for alerts | No | Yes | Yes |
| Weekly release digest (push) | No | Yes | Yes |
| **Stats & Analytics** | | | |
| Basic stats (total watched, recent) | Yes | Yes | Yes |
| Advanced stats (year in review, genre breakdown, time watched) | No | Yes | Yes |
| **AI Features** | | | |
| AI Ticket Art generations | 0/month | 3/month | Unlimited |
| **Customization** | | | |
| Custom app icons | No | Yes | Yes |
| Custom profile themes | No | No | Yes |
| **Support & Access** | | | |
| Early access to new features | No | No | Yes |
| Priority support | No | No | Yes |

### 3.3 Entitlement Model

RevenueCat uses "entitlements" to map products to feature access. We define two:

| Entitlement ID | Products | Unlocks |
|----------------|----------|---------|
| `plus` | `cinetrak_plus_monthly`, `cinetrak_plus_yearly` | All CineTrak+ features |
| `pro` | `cinetrak_pro_monthly`, `cinetrak_pro_yearly` | All CineTrak+ and Pro features |

The client maps these to a single `PremiumTier` type:

```typescript
type PremiumTier = 'free' | 'plus' | 'pro';
```

A user with `pro` entitlement automatically gets all `plus` features. The `usePremium()` hook exposes `hasEntitlement(entitlement)` for fine-grained checks and `isPremium` as a convenience boolean (true if `plus` or `pro`).

---

## 4. Revenue Provider Integration

### 4.1 Recommendation: RevenueCat

**RevenueCat** (`react-native-purchases`) is the recommended provider. Here is the comparison:

| Criteria | RevenueCat | Direct StoreKit / Play Billing | expo-in-app-purchases |
|----------|-----------|-------------------------------|----------------------|
| Expo compatibility | First-class (Expo config plugin, dev build support) | Manual native config | Deprecated / limited |
| Cross-platform | iOS + Android + Web (Stripe) in one SDK | Separate codebases | iOS + Android only |
| Receipt validation | Server-side, automatic | Must build yourself | Must build yourself |
| Subscription analytics | Built-in dashboard (MRR, churn, LTV) | None | None |
| Webhook support | Server-to-server events to Supabase | Must poll or build webhook infra | None |
| Free trial management | Built-in offer configuration | Manual StoreKit setup | Manual |
| Pricing | Free under $2,500 MTR; 1% of revenue above that | Free (just store commissions) | Free |
| Paywall UI components | `react-native-purchases-ui` with remote config | Build from scratch | Build from scratch |
| Development / Expo Go | Preview API Mode (mock purchases in Expo Go) | Not possible in Expo Go | Not possible in Expo Go |
| Restore purchases | `Purchases.restorePurchases()` — one call | Complex StoreKit code | Complex code |
| Maintenance | RevenueCat handles store API changes | Must update for each OS release | Unmaintained |

**Verdict**: RevenueCat is the clear choice. It is free until $2,500/month in tracked revenue, provides first-class Expo support, handles all receipt validation server-side, and ships with a webhook system that integrates cleanly with our Supabase Edge Function architecture. The 1% revenue share above $2,500 MTR is negligible compared to the engineering cost of building and maintaining our own subscription infrastructure.

### 4.2 RevenueCat Setup

#### Dependencies

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

#### Expo Config Plugin

Add to `app.config.js` `plugins` array:

```javascript
// app.config.js plugins array
"react-native-purchases",
```

No additional native configuration is needed — the Expo config plugin handles the rest.

#### App Store Connect / Google Play Console Products

| Product ID | Type | Price | Trial |
|------------|------|-------|-------|
| `cinetrak_plus_monthly` | Auto-renewable subscription | $2.99/month | 7-day free trial |
| `cinetrak_plus_yearly` | Auto-renewable subscription | $19.99/year | 7-day free trial |
| `cinetrak_pro_monthly` | Auto-renewable subscription | $4.99/month | 7-day free trial |
| `cinetrak_pro_yearly` | Auto-renewable subscription | $39.99/year | 7-day free trial |

All four products belong to the same **subscription group** ("CineTrak Premium") so Apple/Google handle upgrades/downgrades correctly.

#### RevenueCat Dashboard Configuration

1. Create project "CineTrak" in RevenueCat dashboard
2. Add iOS app (bundle ID: `com.cinetrak.app`) with App Store Connect shared secret
3. Add Android app (package name: TBD) with Google Play service account JSON
4. Create Offerings:
   - **Default Offering**: Shows both CineTrak+ and CineTrak Pro with monthly/yearly options
5. Create Entitlements: `plus`, `pro`
6. Map products to entitlements
7. Configure webhook endpoint: `https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/validate-subscription`
8. Set webhook authentication token as Supabase secret

---

## 5. Database Schema

### 5.1 Existing `profiles` Table — No Schema Changes Needed

The profiles table already has the columns we need:

```sql
-- Already exists on the profiles table:
account_tier TEXT DEFAULT 'free'     -- 'free', 'plus', 'pro', 'dev'
tier_expires_at TIMESTAMPTZ          -- When the current tier expires (nullable)
```

The existing `account_tier` column currently supports `'free'`, `'premium'`, and `'dev'`. We will expand valid values to `'free'`, `'plus'`, `'pro'`, and `'dev'`:

```sql
-- Migration: rename 'premium' values to 'plus' for existing rows (if any)
UPDATE profiles SET account_tier = 'plus' WHERE account_tier = 'premium';
```

### 5.2 New `subscriptions` Table — Detailed Transaction Log

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- RevenueCat identifiers
  revenuecat_customer_id TEXT NOT NULL,      -- RevenueCat $RCAnonymousID or app user ID
  entitlement_id TEXT NOT NULL,              -- 'plus' or 'pro'

  -- Product info
  product_id TEXT NOT NULL,                  -- e.g., 'cinetrak_plus_yearly'
  store TEXT NOT NULL,                       -- 'app_store', 'play_store', 'stripe'
  store_transaction_id TEXT,                 -- Apple/Google/Stripe transaction ID

  -- Subscription lifecycle
  status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'expired', 'canceled', 'billing_retry', 'paused', 'grace_period'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                    -- Current period end
  canceled_at TIMESTAMPTZ,                   -- When user initiated cancel (may still be active until expires_at)
  grace_period_expires_at TIMESTAMPTZ,       -- Billing grace period end (still has access)

  -- Trial tracking
  is_trial BOOLEAN DEFAULT false,
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,

  -- Metadata
  environment TEXT DEFAULT 'production',     -- 'production' or 'sandbox'
  raw_event JSONB,                           -- Last webhook event payload (for debugging)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(user_id, product_id, store_transaction_id)
);

-- Indexes for common queries
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_revenuecat ON subscriptions(revenuecat_customer_id);

-- RLS: Users can read their own subscriptions; edge functions write via service role
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for users — only the service role (edge function) writes
```

### 5.3 Helper Function — Sync Profile Tier from Subscriptions

```sql
-- Function called by edge function after subscription update
CREATE OR REPLACE FUNCTION sync_profile_tier(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_tier TEXT := 'free';
  v_expires TIMESTAMPTZ;
BEGIN
  -- Find the highest active entitlement
  SELECT
    CASE
      WHEN entitlement_id = 'pro' THEN 'pro'
      WHEN entitlement_id = 'plus' THEN 'plus'
      ELSE 'free'
    END,
    expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'grace_period')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY
    CASE entitlement_id
      WHEN 'pro' THEN 1
      WHEN 'plus' THEN 2
      ELSE 3
    END
  LIMIT 1;

  -- Don't downgrade dev accounts
  IF (SELECT account_tier FROM profiles WHERE id = p_user_id) = 'dev' THEN
    RETURN;
  END IF;

  -- Update profile
  UPDATE profiles
  SET account_tier = COALESCE(v_tier, 'free'),
      tier_expires_at = v_expires,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. Client-Side Architecture

### 6.1 `PremiumContext` / `usePremium()` Hook

**File**: `lib/premium-context.tsx`

This is the single source of truth for premium status in the app. It wraps RevenueCat's SDK and provides a clean interface.

```typescript
// lib/premium-context.tsx

interface PremiumContextType {
  /** Current premium tier: 'free', 'plus', or 'pro' */
  tier: PremiumTier;
  /** Convenience: true if user has CineTrak+ or Pro */
  isPremium: boolean;
  /** Convenience: true if user has CineTrak Pro */
  isPro: boolean;
  /** Check if user has a specific entitlement */
  hasEntitlement: (entitlement: 'plus' | 'pro') => boolean;
  /** Check if a specific feature is unlocked for this user */
  isFeatureUnlocked: (featureKey: PremiumFeatureKey) => boolean;
  /** Current subscription details (null if free) */
  subscription: SubscriptionInfo | null;
  /** Whether premium status is still loading */
  isLoading: boolean;
  /** Show the upgrade prompt sheet for a specific feature */
  showUpgradePrompt: (featureKey: PremiumFeatureKey) => void;
  /** Restore previous purchases */
  restorePurchases: () => Promise<void>;
  /** Purchase a specific package */
  purchasePackage: (packageId: string) => Promise<boolean>;
}

interface SubscriptionInfo {
  tier: 'plus' | 'pro';
  productId: string;
  store: 'app_store' | 'play_store' | 'stripe';
  expiresAt: Date | null;
  isTrialActive: boolean;
  willRenew: boolean;
}

type PremiumTier = 'free' | 'plus' | 'pro';
```

**Provider placement** in `app/_layout.tsx`:

```
QueryProvider > NetworkProvider > AdsProvider > GuestProvider > AuthProvider >
  OnboardingProvider > ThemeProvider > PremiumProvider > AchievementProvider
```

The `PremiumProvider` sits between `ThemeProvider` and `AchievementProvider`. It needs access to `useAuth()` (for user ID) and `useTheme()` (for the upgrade sheet). It wraps `AchievementProvider` because achievements may reference premium status.

**Initialization flow**:

1. On mount, check if user is authenticated
2. If authenticated, configure RevenueCat with user ID as app user ID: `Purchases.logIn(user.id)`
3. Fetch `CustomerInfo` from RevenueCat: `Purchases.getCustomerInfo()`
4. Derive `PremiumTier` from active entitlements
5. Set up listener for subscription changes: `Purchases.addCustomerInfoUpdateListener()`
6. On auth change (sign out / sign in), re-sync with RevenueCat

**Fallback behavior**:
- If RevenueCat is unavailable (network error, SDK not initialized), fall back to `profiles.account_tier` from Supabase
- This ensures premium users are never locked out even during brief connectivity issues
- The `account_tier` on profiles is kept in sync by the webhook edge function

### 6.2 `usePremiumGate()` Hook

**File**: `hooks/use-premium-gate.ts`

Convenience hook for gating actions behind premium, following the same pattern as `useRequireAuth()` in `hooks/use-require-auth.ts`:

```typescript
// hooks/use-premium-gate.ts

interface UsePremiumGateReturn {
  /** Wrap an action — executes if premium, shows upgrade prompt if not */
  requirePremium: (action: () => void, featureKey: PremiumFeatureKey) => void;
  /** Whether the upgrade prompt sheet is visible */
  isUpgradePromptVisible: boolean;
  /** The feature key that triggered the prompt */
  promptFeatureKey: PremiumFeatureKey | null;
  /** Hide the upgrade prompt */
  hideUpgradePrompt: () => void;
}
```

Usage mirrors `useRequireAuth()`:

```tsx
const { requirePremium, isUpgradePromptVisible, promptFeatureKey, hideUpgradePrompt } = usePremiumGate();

// In a press handler:
<Pressable onPress={() => requirePremium(handleSetReminder, 'release_reminders')}>
  <Text>Set Reminder</Text>
</Pressable>

// In the render tree:
<UpgradePromptSheet
  visible={isUpgradePromptVisible}
  featureKey={promptFeatureKey}
  onClose={hideUpgradePrompt}
/>
```

### 6.3 `PremiumGate` Component

**File**: `components/premium-gate.tsx`

A wrapper component that renders its children normally for premium users, or with a lock overlay for free users:

```typescript
// components/premium-gate.tsx

interface PremiumGateProps {
  /** The feature being gated */
  featureKey: PremiumFeatureKey;
  /** What to render (always rendered, but may have lock overlay) */
  children: React.ReactNode;
  /** Lock style: 'overlay' dims content with lock icon, 'badge' shows inline badge */
  mode?: 'overlay' | 'badge' | 'disable';
  /** Optional: custom fallback component instead of default lock overlay */
  fallback?: React.ReactNode;
}
```

Modes:
- **`overlay`** (default): Renders children at reduced opacity with a lock icon centered on top. Tapping shows `UpgradePromptSheet`.
- **`badge`**: Renders children normally but adds a small `PremiumBadge` (lock icon) inline. Tapping the badge shows `UpgradePromptSheet`.
- **`disable`**: Renders children but disables interaction (opacity 0.5, `pointerEvents: 'none'`). A lock badge is shown. Tapping anywhere in the area shows `UpgradePromptSheet`.

### 6.4 `UpgradePromptSheet` Component

**File**: `components/modals/upgrade-prompt-sheet.tsx`

A bottom sheet modal (using `@gorhom/bottom-sheet` which is already installed) that shows a contextual upgrade prompt:

```typescript
// components/modals/upgrade-prompt-sheet.tsx

interface UpgradePromptSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** The feature that triggered this prompt */
  featureKey: PremiumFeatureKey | null;
  /** Close callback */
  onClose: () => void;
}
```

The sheet fetches feature metadata from the `PremiumFeatureRegistry` to display:
- Feature icon (from Ionicons)
- Feature title: e.g., "Unlock Release Reminders"
- Feature description: e.g., "Get push notifications when movies you care about are released"
- Minimum required tier badge: "CineTrak+" or "CineTrak Pro"
- "Upgrade" CTA button (navigates to paywall screen)
- "Maybe Later" dismiss link

Visual design follows the existing `LoginPromptModal` pattern in `components/modals/login-prompt-modal.tsx` — same bottom-sheet layout with icon, title, message, and CTA buttons.

### 6.5 `PremiumBadge` Component

**File**: `components/premium-badge.tsx`

A small inline indicator for premium features:

```typescript
// components/premium-badge.tsx

interface PremiumBadgeProps {
  /** Size variant */
  size?: 'sm' | 'md';
  /** Optional: show 'PRO' text for pro-only features */
  tier?: 'plus' | 'pro';
}
```

Renders a small lock icon (`lock-closed` from Ionicons) in `colors.gold` (#fbbf24, already defined in `constants/theme.ts` as the "Premium/highlights" color). The `'md'` variant includes text: "CineTrak+" or "PRO".

### 6.6 `lib/premium-service.ts` — Subscription Service

**File**: `lib/premium-service.ts`

Service layer that handles:

```typescript
// lib/premium-service.ts

/** Initialize RevenueCat SDK (called once on app launch) */
export async function initializePurchases(): Promise<void>;

/** Configure RevenueCat with current user's ID (called on auth state change) */
export async function identifyUser(userId: string): Promise<void>;

/** Reset RevenueCat to anonymous user (called on sign out) */
export async function logOutPurchases(): Promise<void>;

/** Get current subscription info from RevenueCat */
export async function getSubscriptionInfo(): Promise<SubscriptionInfo | null>;

/** Get available packages (products + pricing) */
export async function getOfferings(): Promise<Offering[]>;

/** Purchase a specific package */
export async function purchasePackage(pkg: Package): Promise<PurchaseResult>;

/** Restore previous purchases */
export async function restorePurchases(): Promise<RestoreResult>;

/** Fallback: check premium status from Supabase profiles table */
export async function checkPremiumFromProfile(userId: string): Promise<PremiumTier>;

/** Open native subscription management (App Store / Play Store) */
export async function openSubscriptionManagement(): Promise<void>;
```

The service initializes RevenueCat with platform-specific API keys stored in `app.config.js` `extra`:

```javascript
// app.config.js extra
revenueCatAppleApiKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY,
revenueCatGoogleApiKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
```

---

## 7. Premium Feature Registry

### 7.1 Design

**File**: `lib/premium-features.ts`

A centralized registry of all premium-gated features. Adding a new gated feature requires only adding one entry here:

```typescript
// lib/premium-features.ts

export type PremiumFeatureKey =
  | 'ad_removal'
  | 'unlimited_scans'
  | 'release_reminders'
  | 'calendar_genre_filter'
  | 'calendar_platform_filter'
  | 'calendar_personalized_filter'
  | 'follow_creators'
  | 'weekly_digest'
  | 'advanced_stats'
  | 'ai_ticket_art'
  | 'custom_app_icons'
  | 'custom_profile_themes'
  | 'early_access'
  | 'priority_support';

interface PremiumFeatureConfig {
  /** Human-readable feature name */
  title: string;
  /** Short value proposition (shown in upgrade prompt) */
  description: string;
  /** Ionicons icon name */
  icon: string;
  /** Minimum tier required to unlock this feature */
  requiredTier: 'plus' | 'pro';
  /** Category for grouping in paywall screen */
  category: 'core' | 'calendar' | 'stats' | 'ai' | 'customization' | 'support';
}

export const PREMIUM_FEATURES: Record<PremiumFeatureKey, PremiumFeatureConfig> = {
  ad_removal: {
    title: 'Ad-Free Experience',
    description: 'Browse without interruptions — no banners, no interstitials',
    icon: 'eye-off-outline',
    requiredTier: 'plus',
    category: 'core',
  },
  unlimited_scans: {
    title: 'Unlimited Ticket Scans',
    description: 'Scan up to 20 tickets per day instead of 3',
    icon: 'scan-outline',
    requiredTier: 'plus',
    category: 'core',
  },
  release_reminders: {
    title: 'Release Reminders',
    description: 'Get push notifications when movies you care about are released',
    icon: 'notifications-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_genre_filter: {
    title: 'Genre Filter',
    description: 'Filter the release calendar by genre to see only what you love',
    icon: 'film-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_platform_filter: {
    title: 'My Platforms Only',
    description: 'Show only releases on your streaming services',
    icon: 'tv-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_personalized_filter: {
    title: 'Personalized Only',
    description: 'Hide releases that don\'t match your taste profile',
    icon: 'sparkles-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  follow_creators: {
    title: 'Follow Actors & Directors',
    description: 'Get alerts when your favorite creators have new releases',
    icon: 'people-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  weekly_digest: {
    title: 'Weekly Release Digest',
    description: 'A weekly push notification with personalized release highlights',
    icon: 'mail-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  advanced_stats: {
    title: 'Advanced Stats',
    description: 'Year in review, genre breakdown, total time watched, and more',
    icon: 'bar-chart-outline',
    requiredTier: 'plus',
    category: 'stats',
  },
  ai_ticket_art: {
    title: 'AI Ticket Art',
    description: 'Generate beautiful AI artwork for your movie journey cards',
    icon: 'color-palette-outline',
    requiredTier: 'plus',
    category: 'ai',
  },
  custom_app_icons: {
    title: 'Custom App Icons',
    description: 'Choose from exclusive icon designs for your home screen',
    icon: 'apps-outline',
    requiredTier: 'plus',
    category: 'customization',
  },
  custom_profile_themes: {
    title: 'Custom Profile Themes',
    description: 'Personalize your profile with exclusive color themes',
    icon: 'color-fill-outline',
    requiredTier: 'pro',
    category: 'customization',
  },
  early_access: {
    title: 'Early Access',
    description: 'Be the first to try new features before they launch',
    icon: 'rocket-outline',
    requiredTier: 'pro',
    category: 'support',
  },
  priority_support: {
    title: 'Priority Support',
    description: 'Get faster responses from the CineTrak team',
    icon: 'chatbubble-ellipses-outline',
    requiredTier: 'pro',
    category: 'support',
  },
};
```

### 7.2 Usage Pattern

To gate a new feature:

1. Add a key to `PremiumFeatureKey` union type
2. Add an entry to `PREMIUM_FEATURES` object
3. Wrap the UI in `<PremiumGate featureKey="your_key">` or use `usePremiumGate()`

That's it. The system handles lock indicators, upgrade prompts, and entitlement checks automatically.

---

## 8. UI/UX Specification

### 8.1 PremiumGate Overlay

When a free user sees a premium-gated control (e.g., the genre filter chips in the calendar filter sheet):

```
┌─────────────────────────────────────────┐
│  Genre Filter              🔒 CineTrak+  │  ← Title with PremiumBadge
│  ┌─────────────────────────────────────┐ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │  ← Content dimmed (opacity 0.4)
│  │  ░░  Action  ░  Horror  ░  Sci-Fi ░│ │    Tap anywhere to show upgrade prompt
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 8.2 UpgradePromptSheet

```
┌─────────────────────────────────────────┐
│                  ─                       │  ← Drag handle
│                                         │
│            🔔                            │  ← Feature icon (large, tinted gold)
│                                         │
│      Unlock Release Reminders            │  ← Feature title (h3, display font)
│                                         │
│   Get push notifications when movies     │  ← Description (body, secondary text)
│   you care about are released            │
│                                         │
│         Included in CineTrak+            │  ← Tier badge (gold text)
│                                         │
│   ┌─────────────────────────────────┐   │
│   │        See All Plans            │   │  ← Primary CTA (tint/rose background)
│   └─────────────────────────────────┘   │
│                                         │
│             Maybe Later                  │  ← Dismiss link (secondary text)
│                                         │
└─────────────────────────────────────────┘
```

### 8.3 Paywall Screen

**Route**: `app/upgrade.tsx`

A full-screen upgrade experience accessible from upgrade prompts or Settings.

```
┌─────────────────────────────────────────┐
│  ← Back                                 │
│                                         │
│          🎬 CineTrak Premium             │  ← App icon + title
│                                         │
│   Choose your plan                       │
│                                         │
│   ┌────────────────────────────────────┐│
│   │  ⭐ CineTrak+         $19.99/year ││  ← Plan card (selectable)
│   │     $2.99/month                    ││
│   │                                    ││
│   │  ✓ No ads                          ││
│   │  ✓ 20 ticket scans/day            ││
│   │  ✓ Release reminders              ││
│   │  ✓ Advanced calendar filters       ││
│   │  ✓ Advanced stats                  ││
│   │  ✓ AI Ticket Art (3/month)         ││
│   └────────────────────────────────────┘│
│                                         │
│   ┌────────────────────────────────────┐│
│   │  💎 CineTrak Pro       $39.99/year ││  ← Plan card (selectable)
│   │     $4.99/month                    ││
│   │                                    ││
│   │  Everything in CineTrak+, plus:    ││
│   │  ✓ Unlimited AI art               ││
│   │  ✓ Custom profile themes           ││
│   │  ✓ Early access                    ││
│   │  ✓ Priority support               ││
│   └────────────────────────────────────┘│
│                                         │
│   ┌─────────────────────────────────┐   │
│   │     Start 7-Day Free Trial      │   │  ← CTA (tint background)
│   └─────────────────────────────────┘   │
│                                         │
│   Restore Purchases                      │  ← Link (text button)
│                                         │
│   Terms of Service · Privacy Policy      │  ← Required legal links
│   Subscription auto-renews. Cancel       │  ← Required disclosure text
│   anytime in device Settings.            │
└─────────────────────────────────────────┘
```

**Apple/Google requirements** (must be visible on the paywall):
- Subscription price and billing period
- Free trial duration (if applicable)
- Statement that subscription auto-renews
- How to cancel
- Links to Terms of Service and Privacy Policy
- Restore Purchases button

### 8.4 Success Celebration

After a successful purchase, show a celebration modal (similar to `AchievementCelebration` in `components/achievement-celebration.tsx`):

```
┌─────────────────────────────────────────┐
│                                         │
│              🎉                          │  ← Confetti animation
│                                         │
│        Welcome to CineTrak+!             │  ← Title (gold color)
│                                         │
│     You've unlocked the full             │
│     CineTrak experience.                 │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │         Let's Go                │   │  ← Dismiss CTA
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### 8.5 Premium Badge Placement Examples

In the release calendar filter bottom sheet (`components/calendar/calendar-filters.tsx`):

```
FILTERS
  ┌─────────────────────────────────────┐
  │ Release Type     (free — no badge)  │
  │  [Theatrical] [Streaming] [Digital] │
  ├─────────────────────────────────────┤
  │ Genre               🔒 CineTrak+   │  ← PremiumBadge inline
  │  [Action] [Horror] [Sci-Fi]  (dim) │
  ├─────────────────────────────────────┤
  │ My Platforms Only   🔒 CineTrak+   │
  │  [Toggle switch]             (dim) │
  ├─────────────────────────────────────┤
  │ Personalized Only   🔒 CineTrak+   │
  │  [Toggle switch]             (dim) │
  └─────────────────────────────────────┘
```

In the release card reminder bell:

```
  ┌────────────────────────────────────┐
  │ [poster] Movie Title               │
  │          Action · 2h 15m           │
  │          ⭐ On your watchlist  🔒🔔│  ← Lock icon on bell for free users
  └────────────────────────────────────┘
```

---

## 9. Edge Function: Server-Side Validation

### 9.1 `validate-subscription` Edge Function

**File**: `supabase/functions/validate-subscription/index.ts`

Receives RevenueCat webhook events and updates the `subscriptions` table + `profiles.account_tier`.

```typescript
// Webhook event types from RevenueCat:
// - INITIAL_PURCHASE
// - RENEWAL
// - CANCELLATION
// - UNCANCELLATION
// - BILLING_ISSUE
// - PRODUCT_CHANGE (upgrade/downgrade)
// - EXPIRATION
// - TRANSFER (user changed app user ID)
// - SUBSCRIBER_ALIAS
```

**Implementation**:

```typescript
// supabase/functions/validate-subscription/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Verify webhook authorization token
  const authHeader = req.headers.get('Authorization');
  const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN');
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const event = await req.json();
  const { type, app_user_id, product_id, entitlement_ids, store,
          store_transaction_id, expiration_at_ms, is_trial_period,
          environment } = event;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Map event type to subscription status
  const statusMap: Record<string, string> = {
    INITIAL_PURCHASE: 'active',
    RENEWAL: 'active',
    CANCELLATION: 'canceled',
    UNCANCELLATION: 'active',
    BILLING_ISSUE: 'billing_retry',
    EXPIRATION: 'expired',
  };

  const status = statusMap[type] || 'active';
  const entitlementId = entitlement_ids?.[0] || 'plus';
  const expiresAt = expiration_at_ms
    ? new Date(expiration_at_ms).toISOString()
    : null;

  // Upsert subscription record
  const { error: subError } = await adminClient
    .from('subscriptions')
    .upsert({
      user_id: app_user_id,
      revenuecat_customer_id: app_user_id,
      entitlement_id: entitlementId,
      product_id,
      store,
      store_transaction_id,
      status,
      expires_at: expiresAt,
      canceled_at: type === 'CANCELLATION' ? new Date().toISOString() : undefined,
      is_trial: is_trial_period || false,
      environment: environment || 'production',
      raw_event: event,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,product_id,store_transaction_id',
    });

  if (subError) {
    console.error('Failed to upsert subscription:', subError);
  }

  // Sync profile tier
  const { error: syncError } = await adminClient
    .rpc('sync_profile_tier', { p_user_id: app_user_id });

  if (syncError) {
    console.error('Failed to sync profile tier:', syncError);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
});
```

### 9.2 Server-Side Premium Checks in Existing Edge Functions

Existing edge functions that need premium awareness (e.g., `scan-ticket`) already read `account_tier` from profiles. After the subscription sync, no changes are needed — the `sync_profile_tier` function keeps `profiles.account_tier` in sync, so all existing tier checks work automatically.

For new premium-gated edge functions, use the same pattern:

```typescript
// In any edge function that needs to check premium status:
const { data: profile } = await adminClient
  .from('profiles')
  .select('account_tier')
  .eq('id', userId)
  .single();

const isPremium = profile?.account_tier === 'plus' || profile?.account_tier === 'pro';
```

---

## 10. Settings Screen Additions

### 10.1 New "Subscription" Section

Add a new section to `app/settings/index.tsx` between the "Account" and "App Preferences" sections:

```
SUBSCRIPTION
  ┌─────────────────────────────────────┐
  │ Plan                                │
  │ CineTrak+ · Expires Dec 31, 2026   │  ← Current tier + expiry
  │                            ▶        │    (or "Free Plan" if free)
  ├─────────────────────────────────────┤
  │ Manage Subscription                 │  ← Opens native store management
  │                            ▶        │    (Hidden for free users)
  ├─────────────────────────────────────┤
  │ Restore Purchases                   │  ← Always visible (Apple requirement)
  │                            ▶        │
  └─────────────────────────────────────┘
```

For free users:

```
SUBSCRIPTION
  ┌─────────────────────────────────────┐
  │ Plan                                │
  │ Free Plan                           │
  │                            ▶        │  ← Navigates to upgrade screen
  ├─────────────────────────────────────┤
  │ Restore Purchases                   │
  │                            ▶        │
  └─────────────────────────────────────┘
```

### 10.2 Settings Integration Details

- **"Plan" row**: For premium users, shows tier name and expiry. Tapping opens the upgrade/paywall screen (allowing tier change). For free users, tapping opens the paywall screen.
- **"Manage Subscription" row**: Calls `premium-service.ts` `openSubscriptionManagement()` which opens the native subscription management page (App Store Settings on iOS, Play Store Subscriptions on Android). Only shown for active subscribers.
- **"Restore Purchases" row**: Calls `Purchases.restorePurchases()`. Shows a loading indicator during the process. On success, shows a toast: "Purchases restored!" or "No previous purchases found." This is **required by Apple's App Review Guidelines (3.1.1)**.

---

## 11. UX Flows

### 11.1 Upgrade Flow (from feature tap)

```
User taps locked feature (e.g., genre filter 🔒)
  → UpgradePromptSheet slides up
    → Shows feature title, description, required tier
    → User taps "See All Plans"
      → Navigate to upgrade.tsx paywall screen
        → User selects plan (Plus/Pro) and billing (monthly/yearly)
        → User taps "Start 7-Day Free Trial" or "Subscribe"
          → RevenueCat triggers native purchase sheet (App Store / Play Store)
            → User authenticates (Face ID / fingerprint / password)
              → Purchase succeeds
                → RevenueCat webhook fires → edge function updates DB
                → Client receives CustomerInfo update → PremiumContext updates
                → Success celebration modal appears
                → User is returned to the screen they came from
                → Feature is now unlocked and usable
```

### 11.2 Upgrade Flow (from Settings)

```
User opens Settings
  → Taps "Plan: Free Plan"
    → Navigate to upgrade.tsx paywall screen
      → (Same purchase flow as above)
```

### 11.3 Restore Purchases Flow

```
User opens Settings
  → Taps "Restore Purchases"
    → Loading indicator appears
    → Purchases.restorePurchases() called
      → If previous subscription found:
        → PremiumContext updates with restored tier
        → Toast: "Purchases restored! Welcome back to CineTrak+."
      → If no previous subscription:
        → Toast: "No previous purchases found."
      → If error:
        → Toast: "Could not restore purchases. Please try again."
```

### 11.4 Subscription Expiry Flow

```
RevenueCat EXPIRATION webhook fires
  → Edge function updates subscriptions.status = 'expired'
  → sync_profile_tier() sets profiles.account_tier = 'free'
  → Next time user opens app:
    → PremiumContext fetches CustomerInfo → detects expired
    → Updates tier to 'free'
    → Ads re-appear
    → Premium features show lock icons again
    → No intrusive "your subscription expired" modal
    → (Subtle: Settings shows "Plan: Free Plan" with "Renew" option)
```

### 11.5 Cancellation Flow

```
User cancels subscription in device Settings
  → RevenueCat CANCELLATION webhook fires
  → Edge function updates subscriptions.canceled_at
    (status remains 'active' until expires_at — user keeps access until period ends)
  → Next time user opens app:
    → PremiumContext shows willRenew = false
    → Settings shows: "CineTrak+ · Expires Mar 15, 2026 (Not renewing)"
    → No other UI change until actual expiry
```

### 11.6 Free Trial Flow

```
User taps "Start 7-Day Free Trial" on paywall
  → RevenueCat triggers native purchase sheet
  → Apple/Google shows: "Free for 7 days, then $19.99/year"
  → User confirms
    → INITIAL_PURCHASE webhook fires with is_trial_period = true
    → Edge function sets subscriptions.is_trial = true, trial_end_at = +7 days
    → sync_profile_tier() sets profiles.account_tier = 'plus'
    → User has full premium access immediately
    → If user doesn't cancel before trial ends:
      → RENEWAL webhook fires → subscription continues at full price
    → If user cancels during trial:
      → CANCELLATION webhook fires
      → Access continues until trial_end_at
      → Then EXPIRATION webhook fires → reverts to free
```

---

## 12. Error Handling & Edge Cases

### 12.1 Purchase Errors

| Scenario | Handling |
|----------|----------|
| Purchase canceled by user | No error shown; dismiss purchase sheet silently |
| Payment method declined | Show toast: "Payment failed. Please check your payment method in Settings." |
| Network error during purchase | Show toast: "Purchase could not be completed. Please check your connection and try again." |
| RevenueCat SDK not initialized | Fall back to Supabase `profiles.account_tier`; log error to Sentry |
| Purchase pending (family sharing approval) | Show toast: "Purchase pending approval." Premium features remain locked until confirmed. |
| Sandbox vs production mismatch | `subscriptions.environment` column tracks this; dev builds use `'sandbox'` |

### 12.2 Subscription Status Edge Cases

| Scenario | Handling |
|----------|----------|
| User has active subscription but no network | `PremiumContext` falls back to cached `profiles.account_tier` from last Supabase sync. User keeps premium access. |
| Webhook fails to reach edge function | RevenueCat retries webhooks automatically. `PremiumContext` also syncs on app launch from RevenueCat SDK (client-side source of truth). |
| User changes Apple ID / Google account | RevenueCat `TRANSFER` event updates user mapping. `app_user_id` in webhook ensures correct Supabase user is updated. |
| User downgrades from Pro to Plus | RevenueCat `PRODUCT_CHANGE` event. Edge function updates entitlement. Pro-only features re-lock immediately, Plus features remain. |
| User has both App Store and Play Store subscriptions | RevenueCat handles cross-platform dedup. The highest entitlement wins via `sync_profile_tier()`. |
| `profiles.account_tier = 'dev'` | Developer accounts are never downgraded by `sync_profile_tier()`. All premium features unlocked. |
| Grace period (billing issue) | RevenueCat sends `BILLING_ISSUE` event. User keeps access during grace period (configurable in App Store Connect / Play Console). Profile stays at current tier until expiry. |
| App launches offline with no cached premium state | Default to `'free'` tier. When network returns, `PremiumContext` syncs with RevenueCat and updates. Brief period where premium user sees locked features — acceptable trade-off for security. |

### 12.3 UI Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest user (not signed in) taps locked feature | Show `LoginPromptModal` first (existing pattern from `useRequireAuth`). After sign-in, re-check premium status. |
| User is on web (no native IAP) | RevenueCat Web Billing with Stripe. Same `usePremium()` hook, different payment sheet. If Web Billing not yet set up, show "Subscribe on the iOS/Android app to unlock premium features." |
| Upgrade prompt shown but user is now premium (race condition) | `UpgradePromptSheet` checks `isPremium` on mount. If already premium, auto-dismiss with brief "You already have access!" toast. |
| Multiple upgrade prompts queued | `PremiumContext.showUpgradePrompt()` is debounced — only one sheet at a time. |

---

## 13. Implementation Phases

### Phase 1 — Client Infrastructure & Stub Premium Gate (~1 week)

**Goal**: Ship the premium gating UI framework with a stub backend. Features show lock icons and upgrade prompts, but no real purchases yet (tapping "Upgrade" shows a "Coming Soon" message).

**Scope:**
- [ ] `lib/premium-features.ts` — Feature registry with all feature keys and metadata
- [ ] `lib/premium-context.tsx` — `PremiumProvider` and `usePremium()` hook (reads from `profiles.account_tier` only — no RevenueCat yet)
- [ ] `hooks/use-premium-gate.ts` — `usePremiumGate()` hook mirroring `useRequireAuth()` pattern
- [ ] `components/premium-gate.tsx` — `PremiumGate` wrapper component with overlay/badge/disable modes
- [ ] `components/premium-badge.tsx` — Inline lock/crown icon component
- [ ] `components/modals/upgrade-prompt-sheet.tsx` — Bottom sheet upgrade prompt (navigates to upgrade screen)
- [ ] `app/upgrade.tsx` — Paywall screen (shows plans, "Coming Soon" CTA for now)
- [ ] Add `PremiumProvider` to `app/_layout.tsx` provider tree
- [ ] Wire `PremiumGate` into release calendar filters (genre, platform, personalized) as first integration
- [ ] Wire `PremiumBadge` onto release card reminder bell icon
- [ ] Update `lib/ads-context.tsx` to check `usePremium().isPremium` to disable ads

**Dependencies**: None — builds on existing patterns.

### Phase 2 — RevenueCat Integration & Real Purchases (~1-2 weeks)

**Goal**: Wire up RevenueCat so users can actually purchase subscriptions.

**Scope:**
- [ ] Install `react-native-purchases` and `react-native-purchases-ui`
- [ ] Add RevenueCat Expo config plugin to `app.config.js`
- [ ] Add RevenueCat API keys to Expo `extra` config and EAS secrets
- [ ] `lib/premium-service.ts` — Full service layer wrapping RevenueCat SDK
- [ ] Update `PremiumContext` to use RevenueCat as primary source, Supabase as fallback
- [ ] Set up App Store Connect subscription products (4 products)
- [ ] Set up Google Play Console subscription products (4 products)
- [ ] Configure RevenueCat dashboard: offerings, entitlements, product mapping
- [ ] Update `app/upgrade.tsx` paywall to fetch real pricing from RevenueCat
- [ ] Implement purchase flow with native payment sheet
- [ ] Implement restore purchases flow
- [ ] Success celebration modal after purchase
- [ ] Test in sandbox (iOS Simulator + Android Emulator)

**Dependencies**: Phase 1 complete. App Store Connect / Google Play Console accounts with subscription capability.

### Phase 3 — Server-Side Webhook & Database (~1 week)

**Goal**: Ensure subscription status is reliably synced to our database for server-side validation.

**Scope:**
- [ ] `subscriptions` table migration
- [ ] `sync_profile_tier()` database function
- [ ] Migration to rename existing `'premium'` values to `'plus'` in `profiles.account_tier`
- [ ] `supabase/functions/validate-subscription/index.ts` — RevenueCat webhook handler
- [ ] Configure webhook URL and auth token in RevenueCat dashboard
- [ ] Add `REVENUECAT_WEBHOOK_TOKEN` to Supabase Edge Function secrets
- [ ] Update `lib/database.types.ts` with new `subscriptions` table types
- [ ] Test webhook flow end-to-end (purchase → webhook → DB update → client sync)
- [ ] Verify existing `scan-ticket` edge function still works with new tier values

**Dependencies**: Phase 2 complete. Supabase MCP access for migrations.

### Phase 4 — Settings Integration & Polish (~1 week)

**Goal**: Complete the settings experience and polish edge cases.

**Scope:**
- [ ] Add "Subscription" section to `app/settings/index.tsx`
- [ ] Implement "Manage Subscription" (open native store settings)
- [ ] Implement "Restore Purchases" in Settings
- [ ] Subscription status display (current plan, expiry, renewal status)
- [ ] Handle subscription expiry gracefully (no intrusive modals)
- [ ] Handle billing retry / grace period states
- [ ] Audit all premium-gated features for consistent lock UX
- [ ] Performance: ensure `PremiumContext` doesn't cause unnecessary re-renders (memoize)
- [ ] Accessibility: VoiceOver labels for lock icons ("Premium feature — requires CineTrak+")
- [ ] Gate additional features: advanced stats, AI ticket art, follow creators
- [ ] Web fallback: show "Subscribe on mobile" message if Web Billing not configured

**Dependencies**: Phase 3 complete.

### Phase 5 — Web Billing & Analytics (~1 week, optional for launch)

**Goal**: Enable subscriptions on web and set up revenue analytics.

**Scope:**
- [ ] Configure RevenueCat Web Billing with Stripe
- [ ] Update paywall screen for web (Stripe checkout instead of native sheet)
- [ ] Revenue analytics in RevenueCat dashboard (MRR, churn, LTV)
- [ ] Add subscription tier to Sentry user context for debugging
- [ ] A/B test paywall variants (if RevenueCat Paywalls feature is used)
- [ ] Regional pricing configuration in App Store Connect / Play Console

**Dependencies**: Phase 4 complete. Stripe account setup.

---

## 14. Success Metrics

### 14.1 Conversion (North Star)

| Metric | Target (90 days post-launch) |
|--------|------------------------------|
| Free → CineTrak+ conversion rate | >= 3% of MAU |
| CineTrak+ → Pro upsell rate | >= 10% of Plus subscribers |
| Free trial → paid conversion | >= 60% of trial starters |

### 14.2 Revenue

| Metric | Target |
|--------|--------|
| MRR (Monthly Recurring Revenue) | Track via RevenueCat dashboard |
| ARPU (Average Revenue Per User) | >= $0.15 across all users (ads + subs) |
| LTV (Lifetime Value) of paid user | >= $25 |
| Churn rate (monthly) | < 5% |

### 14.3 UX Quality

| Metric | Target |
|--------|--------|
| Upgrade prompt dismiss rate | >= 85% (prompts should not be annoying) |
| Time from feature tap to purchase complete | < 60 seconds |
| Subscription restore success rate | >= 95% |
| Premium-related crash rate | 0% (graceful fallbacks for all error states) |
| App Store review rating after premium launch | No decrease from current rating |

### 14.4 Engagement

| Metric | Target |
|--------|--------|
| Premium feature adoption (% of premium users using gated features) | >= 70% use at least 2 premium features weekly |
| Ad-removal as upgrade driver | Cited in >= 40% of upgrades (tracked via which prompt triggered the purchase) |
| Calendar features as upgrade driver | Cited in >= 20% of upgrades |

---

## 15. Future Considerations

### 15.1 Promotional Offers

- **Launch discount**: 50% off first year for early adopters
- **Win-back offers**: Discounted price for lapsed subscribers (RevenueCat supports this natively)
- **Seasonal promotions**: Holiday discounts configured remotely via RevenueCat dashboard
- **Referral program**: "Give a friend 1 month free, get 1 month free" (requires referral tracking)

### 15.2 Lifetime Purchase Option

Consider offering a one-time "Lifetime" purchase ($79.99) for users who prefer not to subscribe. This would be a non-consumable IAP that permanently unlocks CineTrak+ features. Pros: appeals to subscription-averse users. Cons: no recurring revenue, harder to manage feature expansion.

### 15.3 Family Sharing

Apple and Google both support family sharing for subscriptions. Enabling this allows one subscription to be shared with up to 6 family members. Consider enabling after launch to reduce churn from households with multiple CineTrak users.

### 15.4 RevenueCat Paywalls (Remote Config)

RevenueCat offers a Paywall Builder that allows designing and A/B testing paywall screens remotely without app updates. Consider adopting `react-native-purchases-ui` `<RevenueCatUI.Paywall>` component in Phase 5 to iterate on conversion without shipping app updates.

### 15.5 Grandfathering Early Users

Consider giving early adopters (signed up before premium launch) a permanent discount or extended free trial as a reward for early support. Track sign-up date via `profiles.created_at`.

### 15.6 Premium Onboarding

After purchase, show a brief "what's new" walkthrough highlighting the features they just unlocked. This increases feature discovery and perceived value, reducing early churn.

---

## Appendix A: Key File Paths (New)

| File | Purpose |
|------|---------|
| `lib/premium-context.tsx` | PremiumProvider + usePremium() hook |
| `lib/premium-service.ts` | RevenueCat SDK wrapper service |
| `lib/premium-features.ts` | Feature registry (keys, metadata, tiers) |
| `hooks/use-premium-gate.ts` | Convenience hook for gating actions |
| `components/premium-gate.tsx` | Wrapper component for premium UI sections |
| `components/premium-badge.tsx` | Inline lock/crown icon |
| `components/modals/upgrade-prompt-sheet.tsx` | Bottom sheet upgrade prompt |
| `app/upgrade.tsx` | Full paywall/upgrade screen |
| `supabase/functions/validate-subscription/index.ts` | RevenueCat webhook handler |

## Appendix B: Key File Paths (Existing — Referenced)

| File | Relevance |
|------|-----------|
| `app/_layout.tsx` | Provider tree — PremiumProvider added here |
| `app/settings/index.tsx` | Settings — subscription section added here |
| `lib/auth-context.tsx` | Auth context pattern — model for PremiumContext |
| `lib/ads-context.tsx` | Ads context — updated to check premium status |
| `lib/theme-context.tsx` | Theme context pattern — model for PremiumContext |
| `lib/database.types.ts` | DB types — subscriptions table types added here |
| `hooks/use-require-auth.ts` | Auth gating hook — model for usePremiumGate() |
| `hooks/use-scan-ticket.ts` | Scan limits — already tier-aware via `account_tier` |
| `components/modals/login-prompt-modal.tsx` | Login prompt — model for UpgradePromptSheet |
| `components/guest-sign-in-prompt.tsx` | Guest prompt — model for premium prompt patterns |
| `components/achievement-celebration.tsx` | Celebration modal — model for purchase success |
| `constants/theme.ts` | Theme colors — `colors.gold` used for premium accents |
| `app.config.js` | Expo config — RevenueCat plugin + API keys added here |
| `supabase/functions/_shared/cors.ts` | Shared CORS — used by webhook edge function |
| `.claude/prds/006-monetization-ads-premium.md` | Original monetization strategy |
| `docs/PRD-release-calendar.md` (Section 8) | Release calendar freemium boundaries |

## Appendix C: Environment Variables (New)

| Variable | Where | Purpose |
|----------|-------|---------|
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | EAS secrets / `.env` | RevenueCat iOS API key |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | EAS secrets / `.env` | RevenueCat Android API key |
| `REVENUECAT_WEBHOOK_TOKEN` | Supabase Edge Function secrets | Webhook auth token |
