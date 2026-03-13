# Design Spec: CineTrak+ Premium Gating Infrastructure (v1)

**Date**: 2026-03-12
**Status**: Ready for implementation
**Scope**: Single-tier (CineTrak+), web-first (RevenueCat Web SDK + Stripe), architecture only (no visual design)
**PRD Reference**: `docs/PRD-premium-gating.md`

---

## Scope Decisions (v1 vs PRD)

| PRD | v1 |
|-----|----|
| Two tiers: CineTrak+ and CineTrak Pro | **Single tier: CineTrak+ only** |
| `react-native-purchases` (native SDK) | **`@revenuecat/purchases-js` (web SDK + Stripe)** |
| Entitlements: `plus` and `pro` | **Entitlement: `plus` only** |
| `PremiumTier = 'free' \| 'plus' \| 'pro'` | **`PremiumTier = 'free' \| 'plus'`** |
| `isPro` convenience boolean | **Not needed** |
| Pro-only features (custom themes, early access, priority support) | **Deferred** |
| Native IAP (StoreKit, Google Play Billing) | **Deferred, architecture designed to scale** |
| Visual/UI design | **Separate deliverable (Gemini prompts)** |

Pricing: **$2.99/month or $19.99/year**. 7-day free trial on both.

---

## Architecture Overview

Three layers, each independently deployable:

```
[RevenueCat Dashboard] --webhook--> [Edge Function] --upsert--> [Supabase DB]
                                                                      |
[Client App] <--read profile.account_tier--- [Supabase Realtime/Query]
     |
     +---> [@revenuecat/purchases-js] --Stripe Checkout--> [Stripe]
```

---

## Layer 1: Database

### 1.1 Migration: Rename `premium` to `plus`

The `profiles.account_tier` column currently holds `'free'`, `'premium'`, `'dev'`. Rename `'premium'` to `'plus'` for consistency with the entitlement model.

```sql
-- Migration: YYYYMMDD_rename_premium_to_plus.sql (part of the subscriptions migration)
UPDATE profiles SET account_tier = 'plus' WHERE account_tier = 'premium';
```

No column or type changes needed. `account_tier` is already `TEXT DEFAULT 'free'` with `tier_expires_at TIMESTAMPTZ` nullable.

### 1.2 New Table: `subscriptions`

Single table tracking all subscription state. The edge function writes via service role; users can only read their own rows.

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- RevenueCat identifiers
  revenuecat_customer_id TEXT NOT NULL,
  entitlement_id TEXT NOT NULL DEFAULT 'plus',    -- v1: always 'plus'

  -- Product info
  product_id TEXT NOT NULL,                        -- 'cinetrak_plus_monthly' or 'cinetrak_plus_yearly'
  store TEXT NOT NULL,                             -- 'stripe' for v1 (web), 'app_store'/'play_store' later
  store_transaction_id TEXT,                       -- Stripe payment intent ID

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active',           -- 'active','expired','canceled','billing_retry','paused','grace_period'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                          -- Current period end
  canceled_at TIMESTAMPTZ,                         -- When user initiated cancel (still active until expires_at)
  grace_period_expires_at TIMESTAMPTZ,

  -- Trial
  is_trial BOOLEAN DEFAULT false,
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,

  -- Metadata
  environment TEXT DEFAULT 'production',           -- 'production' or 'sandbox'
  raw_event JSONB,                                 -- Last webhook payload for debugging
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, product_id, store_transaction_id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_revenuecat ON subscriptions(revenuecat_customer_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy for users. Service role only.
```

### 1.3 Function: `sync_profile_tier()`

Simplified from PRD -- only checks for `plus` entitlement. Protects `dev` accounts from downgrade.

```sql
CREATE OR REPLACE FUNCTION sync_profile_tier(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_tier TEXT := 'free';
  v_expires TIMESTAMPTZ;
BEGIN
  -- Check for active 'plus' subscription
  SELECT 'plus', expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND entitlement_id = 'plus'
    AND status IN ('active', 'grace_period')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC NULLS LAST
  LIMIT 1;

  -- Never downgrade dev accounts
  IF (SELECT account_tier FROM profiles WHERE id = p_user_id) = 'dev' THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET account_tier = COALESCE(v_tier, 'free'),
      tier_expires_at = v_expires,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.4 Migration File

Single migration file: `supabase/migrations/YYYYMMDD_add_subscriptions.sql`

Contents (in order):
1. Rename `'premium'` to `'plus'` in `profiles.account_tier`
2. Create `subscriptions` table with indexes
3. Enable RLS + create read policy
4. Create `sync_profile_tier()` function

---

## Layer 2: Server (Edge Function)

### 2.1 `validate-subscription` Edge Function

**File**: `supabase/functions/validate-subscription/index.ts`

RevenueCat sends webhook events to this endpoint. No user JWT -- authenticates via a shared secret in the `Authorization` header.

**Config**: `supabase/functions/validate-subscription/config.toml`
```toml
[function]
verify_jwt = false
```

**Handled events** (RevenueCat webhook v1):

| Event | Action | Resulting `status` |
|-------|--------|--------------------|
| `INITIAL_PURCHASE` | Upsert subscription, sync profile | `active` |
| `RENEWAL` | Update subscription, sync profile | `active` |
| `CANCELLATION` | Set `canceled_at`, sync profile | `canceled` (still active until `expires_at`) |
| `UNCANCELLATION` | Clear `canceled_at`, sync profile | `active` |
| `EXPIRATION` | Update status, sync profile to `free` | `expired` |
| `BILLING_ISSUE` | Update status, sync profile | `billing_retry` |
| `PRODUCT_CHANGE` | Upsert with new product, sync profile | `active` |
| `SUBSCRIPTION_PAUSED` | Update status | `paused` |

**Implementation outline**:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // 1. Validate webhook secret
    const authHeader = req.headers.get('Authorization');
    const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN');
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse event
    const body = await req.json();
    const event = body.event;  // RevenueCat wraps in { event: { ... } }
    const {
      type,
      app_user_id,
      product_id,
      entitlement_ids,
      store,
      store_transaction_id,
      expiration_at_ms,
      is_trial_period,
      environment,
    } = event;

    // 3. Validate required fields
    if (!app_user_id || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 4. Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 5. Map event type to subscription status
    const STATUS_MAP: Record<string, string> = {
      INITIAL_PURCHASE: 'active',
      RENEWAL: 'active',
      CANCELLATION: 'canceled',
      UNCANCELLATION: 'active',
      BILLING_ISSUE: 'billing_retry',
      EXPIRATION: 'expired',
      PRODUCT_CHANGE: 'active',
      SUBSCRIPTION_PAUSED: 'paused',
    };
    const status = STATUS_MAP[type] || 'active';

    // 6. Upsert subscription record
    const expiresAt = expiration_at_ms
      ? new Date(expiration_at_ms).toISOString()
      : null;

    const upsertData: Record<string, unknown> = {
      user_id: app_user_id,
      revenuecat_customer_id: app_user_id,
      entitlement_id: 'plus',  // v1: always plus
      product_id: product_id || 'unknown',
      store: store || 'stripe',
      store_transaction_id: store_transaction_id || null,
      status,
      expires_at: expiresAt,
      is_trial: is_trial_period || false,
      environment: environment || 'production',
      raw_event: event,
      updated_at: new Date().toISOString(),
    };

    if (type === 'CANCELLATION') {
      upsertData.canceled_at = new Date().toISOString();
    }
    if (type === 'UNCANCELLATION') {
      upsertData.canceled_at = null;
    }
    if (is_trial_period && type === 'INITIAL_PURCHASE') {
      upsertData.trial_start_at = new Date().toISOString();
      upsertData.trial_end_at = expiresAt;
    }

    const { error: subError } = await adminClient
      .from('subscriptions')
      .upsert(upsertData, {
        onConflict: 'user_id,product_id,store_transaction_id',
      });

    if (subError) {
      console.error('[validate-subscription] Upsert error:', subError);
    }

    // 7. Sync profile tier
    const { error: syncError } = await adminClient
      .rpc('sync_profile_tier', { p_user_id: app_user_id });

    if (syncError) {
      console.error('[validate-subscription] Sync error:', syncError);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[validate-subscription] Unhandled error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
```

**Secrets to configure** (via `supabase secrets set`):
- `REVENUECAT_WEBHOOK_TOKEN` -- shared secret, also configured in RevenueCat dashboard webhook settings

**RevenueCat webhook URL**:
```
https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/validate-subscription
```

---

## Layer 3: Client

### 3.1 Dependency

```bash
npm install @revenuecat/purchases-js
```

This is the web-only SDK. It uses Stripe for payment processing. When we add native iOS/Android support later, we add `react-native-purchases` alongside it (platform-specific imports).

### 3.2 `lib/premium-features.ts` -- Feature Registry

Central registry. Adding a new gated feature = adding one entry here. No Pro tier features in v1.

```typescript
export type PremiumFeatureKey =
  | 'ad_removal'
  | 'unlimited_scans'
  | 'release_reminders'
  | 'calendar_genre_filter'
  | 'calendar_platform_filter'
  | 'calendar_personalized_filter'
  | 'advanced_stats';

interface PremiumFeatureConfig {
  title: string;
  description: string;
  icon: string;               // Ionicons name
  requiredTier: 'plus';       // v1: always 'plus'
  category: 'core' | 'calendar' | 'stats';
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
    description: "Hide releases that don't match your taste profile",
    icon: 'sparkles-outline',
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
};

/** Check if a feature is unlocked for a given tier */
export function isFeatureUnlocked(
  featureKey: PremiumFeatureKey,
  tier: 'free' | 'plus' | 'dev'
): boolean {
  if (tier === 'dev') return true;
  if (tier === 'free') return false;
  return true; // v1: 'plus' unlocks everything
}
```

### 3.3 `lib/premium-service.ts` -- RevenueCat Web SDK Wrapper

Wraps `@revenuecat/purchases-js`. Handles initialization, user identification, purchase flow, and Supabase fallback.

```typescript
import { Purchases } from '@revenuecat/purchases-js';

// Singleton instance
let purchasesInstance: Purchases | null = null;

/** Initialize RevenueCat web SDK. Called once on app mount. */
export async function initializePurchases(apiKey: string): Promise<void>;

/** Identify user with RevenueCat (call on auth state change) */
export async function identifyUser(userId: string): Promise<void>;

/** Log out from RevenueCat (call on sign out) */
export async function logOutPurchases(): Promise<void>;

/** Get current customer info and derive subscription state */
export async function getSubscriptionInfo(): Promise<SubscriptionInfo | null>;

/** Get available packages (products + pricing from RevenueCat offering) */
export async function getOfferings(): Promise<Offering[]>;

/** Purchase a package (triggers Stripe Checkout on web) */
export async function purchasePackage(packageId: string): Promise<PurchaseResult>;

/** Restore purchases */
export async function restorePurchases(): Promise<RestoreResult>;

/** Fallback: read account_tier from Supabase profiles */
export async function checkPremiumFromProfile(userId: string): Promise<PremiumTier>;

/** Open subscription management (Stripe Customer Portal on web) */
export async function openSubscriptionManagement(): Promise<void>;
```

**Key types**:

```typescript
export type PremiumTier = 'free' | 'plus';

export interface SubscriptionInfo {
  tier: 'plus';
  productId: string;
  store: 'stripe';                    // v1: always Stripe
  expiresAt: Date | null;
  isTrialActive: boolean;
  willRenew: boolean;
}

export interface Offering {
  identifier: string;
  packages: Package[];
}

export interface Package {
  identifier: string;                  // e.g., '$rc_monthly', '$rc_annual'
  productId: string;
  priceString: string;                // e.g., '$2.99', '$19.99'
  price: number;
  currencyCode: string;
  period: 'monthly' | 'yearly';
  introPrice?: {
    priceString: string;
    price: number;
    period: string;                    // e.g., '7 days'
  };
}

export interface PurchaseResult {
  success: boolean;
  customerInfo?: any;
  error?: string;
}

export interface RestoreResult {
  restored: boolean;
  tier: PremiumTier;
  message: string;
}
```

### 3.4 `lib/premium-context.tsx` -- PremiumProvider + usePremium()

**Single source of truth** for premium status in the app. Follows the existing context pattern from `lib/theme-context.tsx` and `lib/ads-context.tsx`.

```typescript
interface PremiumContextType {
  /** Current tier */
  tier: PremiumTier;                   // 'free' | 'plus'
  /** Convenience: true if user has CineTrak+ (or dev) */
  isPremium: boolean;
  /** Check if a specific feature is unlocked */
  isFeatureUnlocked: (featureKey: PremiumFeatureKey) => boolean;
  /** Current subscription details (null if free) */
  subscription: SubscriptionInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Show upgrade prompt for a feature */
  showUpgradePrompt: (featureKey: PremiumFeatureKey) => void;
  /** Restore purchases */
  restorePurchases: () => Promise<RestoreResult>;
  /** Purchase a package */
  purchasePackage: (packageId: string) => Promise<PurchaseResult>;
}
```

**Initialization flow**:

1. On mount: read `profiles.account_tier` from Supabase (instant, cached by React Query)
2. If `account_tier === 'dev'`: set `tier = 'plus'`, `isPremium = true`, skip RevenueCat entirely
3. If user is authenticated: initialize RevenueCat web SDK, call `identifyUser(user.id)`
4. Fetch `CustomerInfo` from RevenueCat, check for `plus` entitlement
5. Derive tier from entitlement, fall back to `profiles.account_tier` if RevenueCat unavailable
6. Listen for customer info updates via RevenueCat listener
7. On auth change (sign out): call `logOutPurchases()`, reset to `'free'`

**Dev mode bypass**: If `profiles.account_tier === 'dev'`, all premium checks return true. No RevenueCat calls. This lets dev/test accounts bypass payment without polluting RevenueCat analytics.

**Fallback chain**: RevenueCat entitlement --> `profiles.account_tier` --> `'free'`

**Provider placement** in `app/_layout.tsx`:

```
QueryProvider > NetworkProvider > AdsProvider > GuestProvider > AuthProvider >
  OnboardingProvider > ThemeProvider > PremiumProvider > AchievementProvider
```

Between `ThemeProvider` and `AchievementProvider`. Needs `useAuth()` for user ID. The `AdsProvider` must wrap `PremiumProvider` so premium context can call `setAdsEnabled(false)` when premium is detected.

**State update on premium detection**: When `isPremium` becomes true, call `setAdsEnabled(false)` from `useAds()`. When it becomes false (expiry), call `setAdsEnabled(true)`.

### 3.5 `hooks/use-premium.ts` -- Convenience Re-export

```typescript
export { usePremium } from '@/lib/premium-context';
```

Keeps imports clean and consistent with other hooks (`use-auth.ts`, `use-theme.ts`).

### 3.6 `components/premium/premium-gate.tsx`

Wrapper component. Renders children normally for premium users, or with a lock overlay for free users.

```typescript
interface PremiumGateProps {
  featureKey: PremiumFeatureKey;
  children: React.ReactNode;
  /** 'overlay': dims + lock icon. 'badge': inline badge. 'disable': disabled + lock. */
  mode?: 'overlay' | 'badge' | 'disable';
  fallback?: React.ReactNode;
}
```

**Behavior by mode**:
- `overlay` (default): Wraps children in a `View` with `opacity: 0.4`. Centers a lock icon on top. Entire area is `Pressable` -- tap triggers `showUpgradePrompt(featureKey)`.
- `badge`: Renders children normally. Inserts a `PremiumBadge` in the top-right corner. Badge tap triggers upgrade prompt.
- `disable`: Sets `pointerEvents: 'none'` + `opacity: 0.5` on children. Wraps in `Pressable` that triggers upgrade prompt.

If `isPremium` or `tier === 'dev'`: renders children with no modification.

### 3.7 `components/premium/premium-badge.tsx`

Small inline lock indicator.

```typescript
interface PremiumBadgeProps {
  size?: 'sm' | 'md';     // 'sm': icon only (12px). 'md': icon + "CineTrak+" text (14px).
}
```

Uses `lock-closed` Ionicon in `colors.gold` (`#fbbf24` from `constants/theme.ts`). The `md` variant shows "CineTrak+" text next to the icon.

### 3.8 `components/premium/upgrade-prompt-sheet.tsx`

Bottom sheet modal following the pattern from `components/modals/login-prompt-modal.tsx`. Uses `Modal` with `animationType="slide"` (same as login prompt -- not `@gorhom/bottom-sheet`, for consistency and simplicity).

```typescript
interface UpgradePromptSheetProps {
  visible: boolean;
  featureKey: PremiumFeatureKey | null;
  onClose: () => void;
}
```

**Content** (derived from `PREMIUM_FEATURES[featureKey]`):
1. Feature icon (large, `colors.gold` tint)
2. Title: `"Unlock {feature.title}"`
3. Description: `feature.description`
4. Tier badge: "Included in CineTrak+"
5. Primary CTA: "See Plans" -- navigates to `app/upgrade.tsx`
6. Dismiss: "Maybe Later"

Layout matches `LoginPromptModal`: overlay backdrop, bottom-anchored card with `borderTopLeftRadius`/`borderTopRightRadius`, icon container, title, message, buttons.

### 3.9 `app/upgrade.tsx` -- Paywall Screen

Full-screen route. Accessible from upgrade prompt CTA and Settings "Plan" row.

**Data source**: Calls `getOfferings()` from `premium-service.ts` to get real pricing from RevenueCat. Falls back to hardcoded prices if offerings unavailable.

**Structure**:
1. Back button (header)
2. App branding section
3. Plan card: CineTrak+ with monthly/yearly toggle and feature list
4. CTA button: "Start 7-Day Free Trial" or "Subscribe" (calls `purchasePackage`)
5. "Restore Purchases" text button
6. Legal: Terms of Service link, Privacy Policy link, auto-renewal disclosure

**Apple/Google compliance** (required even for web-first, for future native):
- Subscription price and billing period visible
- Free trial duration stated
- Auto-renewal disclosure
- Cancel instructions
- ToS and Privacy links
- Restore Purchases button

**Post-purchase**: On successful purchase, show a celebration toast/modal, then navigate back to the previous screen. Premium features unlock immediately (PremiumContext updates via RevenueCat listener).

### 3.10 Settings: Subscription Section

Add a new "SUBSCRIPTION" section to `app/settings/index.tsx`, placed between "ACCOUNT" and "APP PREFERENCES" sections.

**For free users**:
- "Plan" row: shows "Free Plan", chevron right. Tap navigates to `app/upgrade.tsx`.
- "Restore Purchases" row: always visible (Apple requirement). Tap calls `restorePurchases()` with loading indicator and toast result.

**For premium users**:
- "Plan" row: shows "CineTrak+ -- Renews {date}" or "CineTrak+ -- Expires {date} (Not renewing)". Tap navigates to `app/upgrade.tsx`.
- "Manage Subscription" row: calls `openSubscriptionManagement()` (opens Stripe Customer Portal on web).
- "Restore Purchases" row: always visible.

---

## File Manifest

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_add_subscriptions.sql` | DB migration: rename premium, create subscriptions table, create sync_profile_tier() |
| `supabase/functions/validate-subscription/index.ts` | RevenueCat webhook handler edge function |
| `supabase/functions/validate-subscription/config.toml` | `verify_jwt = false` for webhook auth |
| `lib/premium-context.tsx` | PremiumProvider + usePremium() hook |
| `lib/premium-service.ts` | RevenueCat web SDK wrapper |
| `lib/premium-features.ts` | Feature registry (keys, metadata, tier requirements) |
| `components/premium/premium-gate.tsx` | Wrapper component with overlay/badge/disable modes |
| `components/premium/premium-badge.tsx` | Inline lock icon component |
| `components/premium/upgrade-prompt-sheet.tsx` | Bottom sheet upgrade prompt (Modal-based, matches LoginPromptModal) |
| `app/upgrade.tsx` | Full paywall screen with pricing and purchase |
| `hooks/use-premium.ts` | Convenience re-export of usePremium() |

### Files to Modify

| File | Change |
|------|--------|
| `app/_layout.tsx` | Add `PremiumProvider` between `ThemeProvider` and `AchievementProvider` in provider chain. Also add `<Stack.Screen name="upgrade" options={{ headerShown: false }} />` to the Stack navigator. |
| `lib/ads-context.tsx` | Remove the `// Future: also disable for premium users` comment. No import of usePremium — the ads bridge lives in PremiumProvider (see Integration Points). |
| `hooks/use-scan-ticket.ts` | Replace raw `account_tier === 'premium'` check with `usePremium().isPremium` for the `PREMIUM_DAILY_SCAN_LIMIT` branch |
| `supabase/functions/scan-ticket/index.ts` | Read `profiles.account_tier` and pass correct `p_daily_limit` instead of hardcoded `3` (see Integration Points) |
| `app/settings/index.tsx` | Add "SUBSCRIPTION" section between Account and App Preferences |
| `lib/database.types.ts` | Add `subscriptions` table types (Row, Insert, Update) after running migration |
| `package.json` | Add `@revenuecat/purchases-js` dependency |

---

## Integration Points

### Ads Disable (ads-context.tsx)

The `AdsProvider` currently has a `setAdsEnabled` setter. The `PremiumProvider` will call it:

```typescript
// Inside PremiumProvider, after tier is resolved:
const { setAdsEnabled } = useAds();

useEffect(() => {
  setAdsEnabled(!isPremium);
}, [isPremium, setAdsEnabled]);
```

This requires `AdsProvider` to wrap `PremiumProvider` in the provider tree (which it already does per the current layout).

### Scan Ticket Limits (use-scan-ticket.ts)

Current code in `fetchScanStatus()`:

```typescript
const accountTier = profile?.account_tier || 'free';
const baseDailyLimit = accountTier === 'dev' ? 999 : accountTier === 'premium' ? PREMIUM_DAILY_SCAN_LIMIT : DEFAULT_DAILY_SCAN_LIMIT;
```

Change to:

```typescript
const accountTier = profile?.account_tier || 'free';
const baseDailyLimit = accountTier === 'dev' ? 999
  : (accountTier === 'plus' || accountTier === 'premium') ? PREMIUM_DAILY_SCAN_LIMIT
  : DEFAULT_DAILY_SCAN_LIMIT;
```

Note: we keep `'premium'` in the check for backward compatibility during migration rollout. The `'premium'` value will be renamed to `'plus'` by the migration, but this guards against race conditions.

**Server-side fix required**: The `scan-ticket` edge function hardcodes `p_daily_limit: 3` when calling `check_and_increment_scan`. It must read `profiles.account_tier` and pass the correct limit:

```typescript
// In scan-ticket/index.ts, before calling check_and_increment_scan:
const { data: profile } = await supabaseClient
  .from('profiles')
  .select('account_tier')
  .eq('id', user.id)
  .single();

const dailyLimit = profile?.account_tier === 'dev' ? 999
  : (profile?.account_tier === 'plus' || profile?.account_tier === 'premium') ? 20
  : 3;

// Then pass dailyLimit instead of hardcoded 3:
await supabaseClient.rpc('check_and_increment_scan', {
  p_user_id: user.id,
  p_daily_limit: dailyLimit,
});
```

### Provider Chain Order

```
QueryProvider
  NetworkProvider
    AdsProvider              ← provides setAdsEnabled
      GuestProvider
        AuthProvider         ← provides useAuth().user
          OnboardingProvider
            ThemeProvider     ← provides useTheme() for themed components
              PremiumProvider ← NEW: reads auth, calls setAdsEnabled
                AchievementProvider
                  ErrorBoundary
                    RootLayoutNav
```

---

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_REVENUECAT_WEB_API_KEY` | `.env` / EAS secrets | RevenueCat web SDK API key |
| `REVENUECAT_WEBHOOK_TOKEN` | Supabase secrets (`supabase secrets set`) | Webhook auth token for validate-subscription edge function |

Future (when adding native):
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | EAS secrets | RevenueCat iOS API key |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | EAS secrets | RevenueCat Android API key |

---

## RevenueCat Dashboard Configuration (v1)

1. Create project "CineTrak" in RevenueCat
2. Add **Web** app with Stripe integration
3. Create products:
   - `cinetrak_plus_monthly` ($2.99/month, 7-day trial)
   - `cinetrak_plus_yearly` ($19.99/year, 7-day trial)
4. Create entitlement: `plus`
5. Map both products to `plus` entitlement
6. Create offering "default" with both packages
7. Configure webhook:
   - URL: `https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/validate-subscription`
   - Auth header: `Bearer {REVENUECAT_WEBHOOK_TOKEN}`

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| RevenueCat SDK unavailable | Fall back to `profiles.account_tier` from Supabase. Log to Sentry. |
| Webhook fails | RevenueCat retries automatically. Client re-syncs on app launch. |
| Purchase canceled by user | Silent dismiss, no error shown. |
| Payment declined | Toast: "Payment failed. Please check your payment method." |
| Network error during purchase | Toast: "Purchase could not be completed. Check your connection." |
| Guest user taps locked feature | Show `LoginPromptModal` first (existing pattern). After sign-in, re-check premium. |
| User already premium when prompt shows | Auto-dismiss prompt, brief "You already have access!" toast. |
| `profiles.account_tier = 'dev'` | All premium checks return true. No RevenueCat calls. Never downgraded. |
| Offline with no cached state | Default to `'free'`. Re-sync when network returns. |

---

## Testing Plan

### Unit Tests
- `premium-features.ts`: `isFeatureUnlocked()` returns correct values for each tier
- `premium-context.tsx`: Provider correctly derives tier from profile data
- `premium-gate.tsx`: Renders children for premium, overlay for free

### Integration Tests
- Webhook edge function: Send mock RevenueCat events, verify subscription upsert and profile sync
- `sync_profile_tier()`: Verify correct tier derivation from subscription state, verify dev protection

### Manual Smoke Tests
- Free user: sees lock icons on gated features, upgrade prompt on tap, paywall screen loads
- Premium user (set `account_tier='plus'` in DB): no locks, no ads, 20 scan limit
- Dev user: all features unlocked, no RevenueCat calls
- Settings: subscription section shows correct state for free/premium users
- Purchase flow: Stripe Checkout opens, success updates tier

---

## Scaling to Native (Future)

The architecture is designed so native IAP is an additive change:

1. Add `react-native-purchases` (native SDK) alongside `@revenuecat/purchases-js`
2. In `premium-service.ts`, use platform check: `Platform.OS === 'web'` uses web SDK, otherwise native SDK
3. Add RevenueCat Expo config plugin to `app.config.js`
4. Add Apple/Google products in App Store Connect and Play Console
5. Map to same `plus` entitlement in RevenueCat
6. Same webhook, same DB, same client context -- only the SDK layer changes

No changes needed to: database schema, edge function, premium-context, premium-features, premium-gate, premium-badge, upgrade-prompt-sheet, or any consumer of `usePremium()`.
