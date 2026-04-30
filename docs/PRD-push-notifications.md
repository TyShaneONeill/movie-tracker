# PRD: Push Notification Infrastructure

**Version**: 1.0
**Date**: March 3, 2026
**Status**: Draft
**Author**: Product Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Database Schema](#3-database-schema)
4. [Client-Side Architecture](#4-client-side-architecture)
5. [Server-Side Architecture](#5-server-side-architecture)
6. [Deep Linking](#6-deep-linking)
7. [Token Lifecycle](#7-token-lifecycle)
8. [Error Handling & Reliability](#8-error-handling--reliability)
9. [Security](#9-security)
10. [Testing Strategy](#10-testing-strategy)
11. [Implementation Phases](#11-implementation-phases)
12. [Consumer Integration Guide](#12-consumer-integration-guide)
13. [Success Metrics](#13-success-metrics)
14. [Future Considerations](#14-future-considerations)

---

## 1. Overview

### 1.1 Feature Summary

**Push Notification Infrastructure** is a standalone, reusable system that enables CineTrak to send push notifications to users on iOS and Android. It is designed as shared infrastructure that any feature can consume -- release calendar reminders, social interactions, weekly digests, achievement unlocks, and more.

This PRD covers the plumbing, not the features. Individual features (e.g., release reminders) define their own notification triggers and content; this system provides the token management, permission flows, delivery pipeline, and deep link handling they all depend on.

### 1.2 Core Philosophy

- **Infrastructure, not feature** -- built once, consumed by many features with zero coupling
- **Expo-native** -- uses Expo Push Notification Service exclusively (no third-party services like OneSignal or Firebase Cloud Messaging directly)
- **Contextual permission requests** -- never prompt on first launch; ask when the user does something that benefits from notifications
- **Graceful degradation** -- the app works perfectly without push permissions; in-app notifications remain the fallback
- **Token hygiene** -- aggressive cleanup of stale/invalid tokens to maintain high delivery rates
- **Cost-zero delivery** -- Expo Push Service is free with no per-message charges

### 1.3 How It Relates to Existing Systems

| System | Role | Status |
|--------|------|--------|
| In-app notifications (`lib/notification-service.ts`) | Pull-based: user opens app, sees notification list | **Exists** -- CRUD for `notifications` table |
| Push notifications (this PRD) | Push-based: message delivered to device lock screen | **New** |
| Release calendar reminders (`PRD-release-calendar.md` Phase 3) | First consumer of push infra | **Planned** -- depends on this PRD |
| Social notifications (follow, like, comment) | Second consumer of push infra | **Planned** |
| Weekly digest | Third consumer of push infra | **Planned** |

Push notifications **complement** in-app notifications. When a push is sent, a corresponding in-app `notifications` row should also be created so the notification appears in both places.

---

## 2. Current State Analysis

### 2.1 What Exists Today

| Component | File Path | Description |
|-----------|-----------|-------------|
| In-app notification service | `lib/notification-service.ts` | CRUD operations on `notifications` table (fetch, mark read, mark all read) via `supabase.from('notifications')` |
| Notification hook | `hooks/use-notifications.ts` | React Query hook with `['notifications', userId]` and `['notificationCount', userId]` query keys, 2-minute stale time, mutation-based mark-as-read |
| Notification screen | `app/notifications.tsx` | Full screen with FlatList of `NotificationItem` components, fetches actor profiles, auto-marks-all-read after 2 seconds |
| NotificationItem component | `components/social/NotificationItem.tsx` | Renders individual notification with avatar, message, and timestamp |
| Notifications table schema | `lib/database.types.ts` | `notifications` table with columns: `id`, `user_id`, `actor_id`, `type` (string), `data` (JSONB), `read` (boolean), `created_at` |
| Deep link handler | `lib/deep-link-handler.ts` | Handles auth-related deep links (`cinetrak://` scheme) for PKCE and implicit OAuth flows with parameter whitelisting |
| App URL scheme | `app.config.js` | `scheme: "cinetrak"` configured; `associatedDomains: ["applinks:cinetrak.app"]` for universal links |
| Root layout | `app/_layout.tsx` | Provider hierarchy (Query > Network > Ads > Guest > Auth > Onboarding > Theme > Achievement > ErrorBoundary), deep link listener via `expo-linking`, `useProtectedRoute()` for auth gating |
| EAS project ID | `app.config.js` | `extra.eas.projectId: "ecccbab0-48e5-4c5c-b830-f14131408a69"` -- required for Expo push token generation |
| Edge function patterns | `supabase/functions/` | 7+ deployed functions using consistent pattern: `Deno.serve()`, `getCorsHeaders()`, auth via `supabaseUserClient.auth.getUser()`, admin via service role key, `enforceRateLimit()` |
| Rate limiting | `supabase/functions/_shared/rate-limit.ts` | Reusable `enforceRateLimit()` using `check_rate_limit` RPC with configurable window/max; also `enforceIpRateLimit()` for unauthenticated endpoints |
| CORS | `supabase/functions/_shared/cors.ts` | `getCorsHeaders()` with origin allowlist: `cinetrak.app`, `localhost:8081`, `exp://192.168` |
| Cost tracking | `supabase/functions/_shared/cost-tracking.ts` | `checkDailyAiSpend()` + `logAiCost()` pattern for AI-powered endpoints |
| Expo Constants | `package.json` | `expo-constants: ~18.0.13` already installed |

### 2.2 What Does NOT Exist Yet

| Component | Description |
|-----------|-------------|
| `expo-notifications` dependency | Not in `package.json`; not in `app.config.js` plugins array |
| `expo-device` dependency | Not in `package.json` (required to check `Device.isDevice` before token registration) |
| Push token storage | No `push_tokens` table in Supabase |
| Push notification log | No delivery tracking or receipt logging table |
| Notification preferences | No per-feature opt-in/out table |
| Token registration service | No client-side code to request permissions or register tokens |
| Notification handler | No `Notifications.setNotificationHandler()` or response listeners in root layout |
| Server-side push sender | No edge function for sending via Expo Push API (`https://exp.host/--/api/v2/push/send`) |
| Android notification channels | No `Notifications.setNotificationChannelAsync()` calls |
| FCM credentials | Not configured in EAS (required for Android push delivery) |

### 2.3 Dependencies to Install

```bash
npx expo install expo-notifications expo-device
```

> `expo-constants` is already installed (`~18.0.13` in `package.json`).

---

## 3. Database Schema

### 3.1 `push_tokens` -- Device push token registry

Stores one row per device per user. A user may have multiple devices (phone + tablet).

```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,                          -- Expo push token (ExponentPushToken[xxx])
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,                             -- e.g., "iPhone 15 Pro" (optional, for debugging)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Updated on each token refresh
  UNIQUE(user_id, token)
);

-- Indexes
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX idx_push_tokens_last_used ON push_tokens(last_used_at);

-- RLS: Users can manage their own tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_tokens" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);
```

**Design decisions:**
- `UNIQUE(user_id, token)` prevents duplicate registrations -- re-registering the same token is a no-op upsert that updates `last_used_at`
- `last_used_at` enables stale token cleanup (tokens not refreshed in 90+ days are likely from uninstalled apps)
- `platform` is stored for future use (Android-specific channel config, platform-specific rich notification formatting)
- No `enabled` flag -- if a token exists, it is active; deleting the row disables push for that device
- `device_name` is optional metadata for debugging ("Why did user X not receive?")

### 3.2 `push_notification_log` -- Delivery audit trail

Tracks every push notification sent, its delivery status, and any errors.

```sql
CREATE TABLE push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,                          -- Token used for delivery
  ticket_id TEXT,                               -- Expo push ticket ID (for receipt lookup)
  feature TEXT NOT NULL,                        -- Source feature: 'release_reminder', 'social', 'digest', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,                                   -- Deep link URL + custom payload
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'invalid_token')),
  error_message TEXT,                           -- Error details if failed
  sent_at TIMESTAMPTZ,                          -- When Expo accepted the push
  receipt_checked_at TIMESTAMPTZ,               -- When we last checked the receipt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_push_log_user_id ON push_notification_log(user_id);
CREATE INDEX idx_push_log_status ON push_notification_log(status)
  WHERE status IN ('pending', 'sent');
CREATE INDEX idx_push_log_feature ON push_notification_log(feature);
CREATE INDEX idx_push_log_created_at ON push_notification_log(created_at);

-- RLS: Users can read their own logs; service role writes
ALTER TABLE push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_logs" ON push_notification_log
  FOR SELECT USING (auth.uid() = user_id);
```

**Design decisions:**
- `feature` column enables per-feature analytics ("How many release reminders were delivered this week?")
- `ticket_id` allows correlating with Expo push receipts for delivery confirmation
- `status` tracks the full lifecycle: `pending` -> `sent` -> `delivered` / `failed` / `invalid_token`
- Partial index on `status IN ('pending', 'sent')` optimizes receipt-checking queries
- Users can see their own delivery history (useful for debugging "I didn't get the notification")

### 3.3 `notification_preferences` -- Per-feature opt-in/out

```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,                        -- 'release_reminders', 'social', 'weekly_digest', etc.
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);
```

**Design decisions:**
- Granular per-feature control (user can disable social notifications but keep release reminders)
- Defaults to `enabled = true` -- rows are only created when a user explicitly changes a preference
- Absence of a row means "use default" (enabled)

### 3.4 Database Types Update

After running migrations and regenerating types, add to `lib/database.types.ts`:

```typescript
// Helper types for push tokens
export type PushToken = Database['public']['Tables']['push_tokens']['Row'];
export type PushTokenInsert = Database['public']['Tables']['push_tokens']['Insert'];

// Helper types for push notification log
export type PushNotificationLog = Database['public']['Tables']['push_notification_log']['Row'];

// Helper types for notification preferences
export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row'];
```

---

## 4. Client-Side Architecture

### 4.1 New Dependencies and Config

Add to `app.config.js` plugins array:

```javascript
plugins: [
  // ... existing plugins (@sentry, expo-router, expo-apple-authentication, etc.)
  "expo-notifications",
]
```

### 4.2 Push Notification Service

**File**: `lib/push-notification-service.ts`

This is the core client-side module. It handles permissions, token registration, and notification event setup. Follows the same service-layer pattern as `lib/notification-service.ts` and `lib/release-calendar-service.ts`.

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

interface RegisterTokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

// ============================================================================
// Permission & Token Registration
// ============================================================================

/**
 * Check current push notification permission status without prompting.
 */
export async function getPermissionStatus(): Promise<PushPermissionStatus> {
  if (Platform.OS === 'web') return 'denied'; // Web push not supported
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Request push notification permission and register the device token.
 *
 * Call this contextually (e.g., when user taps "Set Reminder"),
 * never on app launch.
 */
export async function registerForPushNotifications(): Promise<RegisterTokenResult> {
  // Push notifications require a physical device
  if (!Device.isDevice) {
    return { success: false, error: 'Push notifications require a physical device' };
  }

  // Web does not support Expo push notifications
  if (Platform.OS === 'web') {
    return { success: false, error: 'Push notifications not supported on web' };
  }

  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { success: false, error: 'Permission not granted' };
  }

  // Get Expo push token using the EAS project ID
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    return { success: false, error: 'EAS project ID not configured' };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    // Store token in Supabase
    await upsertPushToken(token);

    return { success: true, token };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Upsert the push token in the database.
 * Updates last_used_at if the token already exists.
 */
async function upsertPushToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS as 'ios' | 'android',
        device_name: Device.modelName ?? undefined,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );

  if (error) {
    console.error('[push] Failed to upsert token:', error);
  }
}

/**
 * Remove the current device's push token (e.g., on sign-out).
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const { data: { user } } = await supabase.auth.getUser();

    if (user && token) {
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('token', token);
    }
  } catch (error) {
    console.error('[push] Failed to unregister token:', error);
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Silently refresh the push token on app launch (if permission already granted).
 * This catches token rotations that happen when OS updates or app reinstalls.
 */
export async function refreshPushTokenIfNeeded(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  if (!projectId) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    await upsertPushToken(token);
  } catch (error) {
    console.error('[push] Token refresh failed:', error);
  }
}

// ============================================================================
// Android Channel Setup
// ============================================================================

/**
 * Configure Android notification channels. Call once on app startup.
 * On iOS this is a no-op.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B8A', // CineTrak rose/tint color
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Release Reminders',
    description: 'Notifications about upcoming movie releases',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('social', {
    name: 'Social',
    description: 'Follow, like, and comment notifications',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('digest', {
    name: 'Weekly Digest',
    description: 'Weekly summary of upcoming releases',
    importance: Notifications.AndroidImportance.LOW,
  });
}

// ============================================================================
// Notification Handler (foreground behavior)
// ============================================================================

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Call once at app startup (before any notifications arrive).
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ============================================================================
// Deep Link Handling
// ============================================================================

/**
 * Extract a navigation URL from a notification's data payload.
 * Convention: all push notifications include `data.url` with an
 * app-relative path (e.g., "/movie/12345").
 */
export function getNotificationUrl(
  notification: Notifications.Notification
): string | null {
  const data = notification.request.content.data;
  if (data && typeof data.url === 'string') {
    return data.url;
  }
  return null;
}

/**
 * Handle a notification response (user tapped the notification).
 * Routes to the appropriate screen using expo-router.
 *
 * Uses setTimeout(0) to defer navigation until the router is ready,
 * matching the existing deep-link pattern in app/_layout.tsx
 * (see performNavigation() in useProtectedRoute).
 */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const url = getNotificationUrl(response.notification);
  if (url) {
    setTimeout(() => {
      router.push(url as any);
    }, 0);
  }
}
```

### 4.3 Notification Hook

**File**: `hooks/use-push-notifications.ts`

React hook that manages push notification state and provides registration methods to components. Follows the same hook pattern as `hooks/use-notifications.ts`.

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAuth } from './use-auth';
import {
  registerForPushNotifications,
  unregisterPushToken,
  refreshPushTokenIfNeeded,
  setupNotificationChannels,
  configureNotificationHandler,
  handleNotificationResponse,
  getPermissionStatus,
  type PushPermissionStatus,
} from '@/lib/push-notification-service';

interface UsePushNotificationsResult {
  /** Current permission status */
  permissionStatus: PushPermissionStatus;
  /** Whether push is available on this device/platform */
  isAvailable: boolean;
  /** Request permission and register token. Returns true if successful. */
  requestPermission: () => Promise<boolean>;
  /** Unregister token (call on sign-out) */
  unregister: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { user } = useAuth();
  const [permissionStatus, setPermissionStatus] =
    useState<PushPermissionStatus>('undetermined');
  const notificationListener =
    useRef<Notifications.EventSubscription | null>(null);
  const responseListener =
    useRef<Notifications.EventSubscription | null>(null);

  const isAvailable = Platform.OS !== 'web';

  // One-time setup: notification handler + channels + listeners
  useEffect(() => {
    if (!isAvailable) return;

    // Configure foreground display behavior
    configureNotificationHandler();

    // Set up Android channels
    setupNotificationChannels();

    // Listen for notifications received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((_notification) => {
        // Could trigger in-app toast, badge update, query invalidation, etc.
        // The notification handler displays it automatically.
      });

    // Listen for notification taps (background + killed state)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse
      );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isAvailable]);

  // Check permission status on mount and when user changes
  useEffect(() => {
    if (!isAvailable) return;
    getPermissionStatus().then(setPermissionStatus);
  }, [isAvailable, user?.id]);

  // Refresh token on app launch if already granted
  useEffect(() => {
    if (!isAvailable || !user) return;
    refreshPushTokenIfNeeded();
  }, [isAvailable, user?.id]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const result = await registerForPushNotifications();
    const newStatus = await getPermissionStatus();
    setPermissionStatus(newStatus);
    return result.success;
  }, []);

  const unregister = useCallback(async (): Promise<void> => {
    await unregisterPushToken();
  }, []);

  return {
    permissionStatus,
    isAvailable,
    requestPermission,
    unregister,
  };
}
```

### 4.4 Root Layout Integration

**File**: `app/_layout.tsx`

The `usePushNotifications()` hook must be called within `RootLayoutNav`, alongside the existing `useProtectedRoute()` call:

```typescript
import { usePushNotifications } from '@/hooks/use-push-notifications';

function RootLayoutNav() {
  const { effectiveTheme } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: onboardingLoading } = useOnboarding();
  const { isLoading: guestLoading } = useGuest();
  useProtectedRoute();
  usePushNotifications(); // <-- Add this line

  // ... rest of component unchanged
}
```

This ensures:
- Notification channels are created on Android
- Foreground handler is registered before any notifications arrive
- Notification tap listener is active for deep linking
- Token is silently refreshed if permission was previously granted
- All listeners are cleaned up on unmount

### 4.5 Sign-Out Integration

On sign-out, call `unregisterPushToken()` to remove the device's token from the database. This prevents sending notifications to a device after the user has signed out.

```typescript
import { unregisterPushToken } from '@/lib/push-notification-service';

async function signOut() {
  await unregisterPushToken(); // Remove push token before signing out
  await supabase.auth.signOut();
}
```

---

## 5. Server-Side Architecture

### 5.1 Edge Function: `send-push-notification`

**File**: `supabase/functions/send-push-notification/index.ts`

A generic push notification sender. It is **not** called directly by clients -- it is invoked by other edge functions (cron jobs, webhooks) or by database triggers via `pg_net`. Follows the existing edge function boilerplate pattern from `supabase/functions/check-achievements/index.ts` and others.

> **⚠️ Auth pattern note (April 2026):** The original draft of this PRD specified `verify_jwt = false` + manual `authHeader.includes(serviceRoleKey)`. **DO NOT use that pattern.** It silently 401s on the `pg_net` path because the Bearer token's bytes don't byte-match the env var (vault/env divergence). Caused `check-push-receipts` to fail every 15 minutes in production for an unknown duration. Fixed by PR #412 + the shared helper. New cron-fired functions MUST use `verify_jwt = true` in `config.toml` AND import `requireServiceRole` from `supabase/functions/_shared/cron-auth.ts`. The helper file's docstring documents the WHY in detail.

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";

interface PushRequest {
  user_ids: string[];           // Users to notify
  title: string;
  body: string;
  data?: Record<string, any>;  // Must include `url` for deep linking
  feature: string;              // 'release_reminders' | 'social' | 'digest' | etc.
  channel_id?: string;          // Android channel (default: 'default')
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error: string };
}

Deno.serve(async (req: Request) => {
  // Reject anything that isn't a service_role caller. See _shared/cron-auth.ts.
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      user_ids, title, body, data, feature, channel_id,
    }: PushRequest = await req.json();

    // 1. Fetch push tokens for target users
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', user_ids);

    if (tokenError || !tokens?.length) {
      return new Response(
        JSON.stringify({
          sent: 0,
          error: tokenError?.message || 'No tokens found',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check per-user notification preferences
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, enabled')
      .in('user_id', user_ids)
      .eq('feature', feature);

    const disabledUsers = new Set(
      (prefs ?? []).filter(p => !p.enabled).map(p => p.user_id)
    );

    const eligibleTokens = tokens.filter(
      t => !disabledUsers.has(t.user_id)
    );

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 'all_opted_out' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build Expo push messages
    const messages = eligibleTokens.map(t => ({
      to: t.token,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
      channelId: channel_id ?? 'default',
      priority: 'high' as const,
    }));

    // 4. Send in batches of 100 (Expo API limit per request)
    const BATCH_SIZE = 100;
    const allTickets: {
      token: string; ticket: ExpoTicket; user_id: string;
    }[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const tokenBatch = eligibleTokens.slice(i, i + BATCH_SIZE);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
      }

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      const tickets = result.data ?? [];

      tickets.forEach((ticket: ExpoTicket, idx: number) => {
        allTickets.push({
          token: tokenBatch[idx].token,
          ticket,
          user_id: tokenBatch[idx].user_id,
        });
      });
    }

    // 5. Log results
    const logEntries = allTickets.map(({ token, ticket, user_id }) => ({
      user_id,
      token,
      ticket_id: ticket.id ?? null,
      feature,
      title,
      body,
      data: data ?? null,
      status: ticket.status === 'ok' ? 'sent' : 'failed',
      error_message: ticket.status === 'error' ? ticket.message : null,
      sent_at: new Date().toISOString(),
    }));

    await supabaseAdmin.from('push_notification_log').insert(logEntries);

    // 6. Remove tokens that got DeviceNotRegistered errors
    const invalidTokens = allTickets
      .filter(t => t.ticket.details?.error === 'DeviceNotRegistered')
      .map(t => t.token);

    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);

      await supabaseAdmin
        .from('push_notification_log')
        .update({ status: 'invalid_token' })
        .in('token', invalidTokens)
        .eq('feature', feature)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString());
    }

    const sent = allTickets.filter(t => t.ticket.status === 'ok').length;
    const failed = allTickets.filter(t => t.ticket.status === 'error').length;

    return new Response(
      JSON.stringify({
        sent,
        failed,
        invalid_tokens_removed: invalidTokens.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-push-notification] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

**Note on `verify_jwt`**: This function MUST use `verify_jwt = true`. Supabase validates the JWT signature at the gateway, and `requireServiceRole` then enforces `role === 'service_role'` to ensure only internal callers (other edge functions, `pg_net` cron jobs) can trigger it. The earlier-recommended `verify_jwt = false` + `authHeader.includes(serviceRoleKey)` pattern is broken on the `pg_net` path and must not be used — see the helper's docstring at `supabase/functions/_shared/cron-auth.ts` for the full failure mode.

### 5.2 Cron Job Pattern (for consumers)

Consumer features schedule delivery via `pg_cron` + `pg_net`. Secrets are stored in Supabase Vault for security. Example for release reminders (daily at 08:00 UTC):

```sql
-- Store secrets in Vault (one-time setup)
SELECT vault.create_secret(
  'https://wliblwulvsrfgqcnbzeh.supabase.co',
  'project_url'
);
SELECT vault.create_secret(
  '<service-role-key>',
  'service_role_key'
);

-- Schedule the cron job
SELECT cron.schedule(
  'send-release-reminders',
  '0 8 * * *',   -- Daily at 08:00 UTC
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/send-release-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Each consumer feature has its own edge function (e.g., `send-release-reminders`) that:
1. Queries its own data table for pending work (e.g., `release_reminders WHERE remind_at <= now() AND sent = false`)
2. Builds the notification content (title, body, `data.url` for deep linking)
3. Calls the generic `send-push-notification` edge function or uses the Expo Push API directly

### 5.3 Receipt Checking Cron

A separate cron job runs every 15 minutes to check push receipts and update delivery status:

```sql
SELECT cron.schedule(
  'check-push-receipts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/check-push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 5.4 Edge Function: `check-push-receipts`

**File**: `supabase/functions/check-push-receipts/index.ts`

Queries `push_notification_log` for rows with `status = 'sent'` and non-null `ticket_id`, fetches receipts from Expo's `https://exp.host/--/api/v2/push/getReceipts` endpoint, and updates delivery status.

Key behaviors:
- Batches receipt checks (max 1000 ticket IDs per request to Expo)
- Updates `status` to `delivered` or `failed` based on receipt response
- Handles `DeviceNotRegistered` receipts by removing the token from `push_tokens`
- Updates `receipt_checked_at` timestamp on all checked rows

---

## 6. Deep Linking

### 6.1 URL Convention

All push notifications include a `data.url` field containing an app-relative path that maps directly to an expo-router screen:

| Feature | URL Format | Screen File |
|---------|-----------|-------------|
| Release reminder | `/movie/{tmdb_id}` | `app/movie/[id].tsx` |
| New follower | `/user/{user_id}` | `app/user/[id].tsx` |
| First Take like | `/movie/{tmdb_id}` | `app/movie/[id].tsx` |
| Comment | `/movie/{tmdb_id}` | `app/movie/[id].tsx` |
| Weekly digest | `/release-calendar` | `app/release-calendar.tsx` |
| Achievement unlocked | `/achievements` | `app/achievements.tsx` |
| General / fallback | `/notifications` | `app/notifications.tsx` |

### 6.2 How It Works

1. **Notification sent** with `data: { url: "/movie/12345" }`
2. **User taps notification** (whether app is foregrounded, backgrounded, or killed)
3. **Response listener** in `usePushNotifications()` fires `handleNotificationResponse()`
4. **Handler** extracts `data.url` and calls `router.push("/movie/12345")`
5. **expo-router** matches the URL to `app/movie/[id].tsx` and navigates

### 6.3 Cold Start Handling

When the app is killed and the user taps a notification, the app cold-starts. The notification response is queued by `expo-notifications` and delivered once the listener is registered in `usePushNotifications()`. The `setTimeout(..., 0)` in `handleNotificationResponse` ensures the router is mounted before navigation is attempted -- this matches the existing deep-link pattern used in `app/_layout.tsx` where `performNavigation()` also uses `setTimeout(() => { router.replace(...) }, 0)`.

### 6.4 Relationship to Existing Deep Link Infrastructure

The app already has deep link handling for auth flows:
- **URL scheme**: `cinetrak://` (configured in `app.config.js` as `scheme: "cinetrak"`)
- **Universal links**: `applinks:cinetrak.app` in `associatedDomains`
- **Auth deep link handler**: `lib/deep-link-handler.ts` handles `cinetrak://reset-password?code=xxx` via `Linking.addEventListener('url', ...)`

Push notification deep links are handled through a **completely separate mechanism** -- `Notifications.addNotificationResponseReceivedListener` rather than `Linking.addEventListener('url', ...)` -- so they do not conflict with the existing auth deep link flow.

---

## 7. Token Lifecycle

### 7.1 Registration Flow

```
User action triggers push need (e.g., taps "Set Reminder")
  |
  +-- Check: Is this a physical device? (Device.isDevice)
  |   +-- No --> Return gracefully; no error toast
  |
  +-- Check: Is this web? (Platform.OS === 'web')
  |   +-- Yes --> Return gracefully; push not supported on web
  |
  +-- Check: Is permission already granted?
  |   +-- Yes --> Get token silently, upsert to push_tokens
  |   +-- No --> Show system permission prompt
  |       +-- Granted --> Get token, upsert to push_tokens
  |       +-- Denied --> Show toast: "Enable notifications in Settings"
  |
  +-- Return success/failure to calling feature
```

### 7.2 Token Refresh

Tokens can change when:
- The user updates their OS
- The app is reinstalled
- The app binary is rebuilt with a new EAS build
- Expo rotates tokens internally

**Strategy**: On every app launch (in `usePushNotifications`), if permission is already granted, silently call `getExpoPushTokenAsync` and upsert. The `UNIQUE(user_id, token)` constraint means this is a no-op if the token hasn't changed (just updates `last_used_at`), and a new insert if the token has rotated.

### 7.3 Token Cleanup

#### Immediate Cleanup (on send)
When the `send-push-notification` edge function receives a `DeviceNotRegistered` error from Expo, it immediately deletes the token from `push_tokens` and marks the log entry as `invalid_token`.

#### Periodic Cleanup (weekly cron)
A weekly cron job removes stale tokens that haven't been refreshed in 90+ days:

```sql
SELECT cron.schedule(
  'cleanup-stale-push-tokens',
  '0 3 * * 0',  -- Every Sunday at 03:00 UTC
  $$
  DELETE FROM push_tokens
  WHERE last_used_at < now() - interval '90 days';
  $$
);
```

### 7.4 Sign-Out Cleanup

When the user signs out, `unregisterPushToken()` removes the current device's token from the database. The user's tokens on other devices remain active (they will be cleaned up on those devices when the user signs out there, or eventually by the 90-day stale token cron).

---

## 8. Error Handling & Reliability

### 8.1 Client-Side Errors

| Scenario | Handling |
|----------|----------|
| Not a physical device (simulator/emulator) | Return `{ success: false }` gracefully; no error shown to user unless they explicitly tried to set a reminder |
| Web platform | Return `{ success: false }` gracefully; push not supported |
| Permission denied by user | Toast: "Enable notifications in Settings to get reminders" |
| Token registration network failure | Catch silently; retry on next app launch via `refreshPushTokenIfNeeded()` |
| Token upsert to Supabase fails | `console.error`; retry on next launch; push will still work if token was previously saved |
| Notification response with invalid/empty URL | No navigation; silently ignore |

### 8.2 Server-Side Errors

| Scenario | Handling |
|----------|----------|
| `DeviceNotRegistered` from Expo | Delete token from `push_tokens`; mark log as `invalid_token` |
| `MessageTooBig` from Expo | Log error; calling feature must reduce payload (max 4096 bytes total) |
| `MessageRateExceeded` from Expo | Exponential backoff retry (Expo allows 600 notifications/second/project) |
| `InvalidCredentials` from Expo | Log critical error; alert via Sentry; check FCM/APNs config in EAS Dashboard |
| Expo API timeout (no response) | Retry with exponential backoff (max 3 attempts) |
| Expo API 5xx (server error) | Retry with exponential backoff (max 3 attempts) |
| No tokens found for target users | No-op; return `{ sent: 0 }` |
| All target users opted out of feature | No-op; return `{ sent: 0, skipped: 'all_opted_out' }` |

### 8.3 Idempotency

- Re-registering the same token is safe (upsert updates `last_used_at` only)
- Re-sending the same notification is **NOT** idempotent (the user will see duplicates) -- callers must implement their own deduplication (e.g., `release_reminders.sent = true` flag, checked before sending)

---

## 9. Security

### 9.1 Token Protection

- Push tokens are stored in `push_tokens` with RLS: users can only read/write their own tokens
- The `send-push-notification` edge function requires the `SUPABASE_SERVICE_ROLE_KEY` and is never called directly by client apps
- The Expo Push API should be secured with an `EXPO_ACCESS_TOKEN` (generated in Expo Dashboard under "Push Notification Credentials" with enhanced security enabled)

### 9.2 Required Secrets

| Secret | Purpose | How to Set |
|--------|---------|------------|
| `EXPO_ACCESS_TOKEN` | Authenticate with Expo Push API (prevents token interception attacks) | `supabase secrets set EXPO_ACCESS_TOKEN=xxx` |
| `SUPABASE_SERVICE_ROLE_KEY` | Already exists; used by `send-push-notification` for internal auth | Already configured |

### 9.3 Preventing Abuse

- Clients cannot trigger arbitrary push notifications -- there is no client-facing push endpoint
- Rate limiting on consumer edge functions prevents spam (reuses existing `enforceRateLimit()` pattern from `supabase/functions/_shared/rate-limit.ts`)
- `notification_preferences` table allows users to opt out per feature
- `push_notification_log` provides a complete audit trail for debugging and abuse detection

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Test | File |
|------|------|
| `getPermissionStatus` returns `'denied'` on web | `__tests__/lib/push-notification-service.test.ts` |
| `registerForPushNotifications` returns error on non-device | `__tests__/lib/push-notification-service.test.ts` |
| `registerForPushNotifications` handles permission denied | `__tests__/lib/push-notification-service.test.ts` |
| `registerForPushNotifications` calls upsert on success | `__tests__/lib/push-notification-service.test.ts` |
| `unregisterPushToken` calls Supabase delete | `__tests__/lib/push-notification-service.test.ts` |
| `handleNotificationResponse` extracts URL and calls router.push | `__tests__/lib/push-notification-service.test.ts` |
| `handleNotificationResponse` no-ops when URL is missing | `__tests__/lib/push-notification-service.test.ts` |
| `usePushNotifications` hook initialization | `__tests__/hooks/use-push-notifications.test.ts` |

**Mocking strategy**: Mock `expo-notifications`, `expo-device`, and `expo-constants` using jest factory functions, following the pattern established in `__tests__/setup.ts`. Use `jest.fn()` inside the factory, then get references via `(imported.fn as jest.Mock)` (per the Jest mock hoisting lesson in MEMORY.md).

### 10.2 Edge Function Tests

| Test | Description |
|------|-------------|
| `send-push-notification` rejects unauthorized calls | Verify 401 when service_role key is missing |
| `send-push-notification` with valid tokens | Verify Expo API is called with correct payload format |
| `send-push-notification` with opted-out user | Verify notification is skipped, returns `skipped: 'all_opted_out'` |
| `send-push-notification` with DeviceNotRegistered | Verify token is deleted from `push_tokens` |
| `check-push-receipts` processes receipt batch | Verify status updates from `sent` to `delivered`/`failed` in log |

### 10.3 Integration Testing

| Test | Method |
|------|--------|
| Token registration round-trip | Development build on physical device; verify token appears in `push_tokens` table via Supabase Dashboard |
| Push delivery end-to-end | Use Expo Push Tool (https://expo.dev/notifications) to send test notification to registered token |
| Deep link navigation | Send push with `data: { url: "/movie/12345" }`, tap notification, verify `app/movie/[id].tsx` opens |
| Sign-out cleanup | Sign out, verify token is removed from `push_tokens` table |
| Token refresh | Force close app, reopen, verify `last_used_at` is updated |

**Important**: Push notifications cannot be tested in Expo Go or on simulators/emulators. All push testing requires a **development build** (`npx expo run:ios` / `npx expo run:android`) on a **physical device**.

### 10.4 Manual QA Checklist

- [ ] iOS: Permission prompt appears with correct description text
- [ ] iOS: Notification appears on lock screen, notification center, and as banner
- [ ] iOS: Tapping notification opens correct screen
- [ ] iOS: Badge count updates correctly
- [ ] Android: Notification appears in notification shade with correct channel
- [ ] Android: Notification tap opens correct screen
- [ ] Android: Channel settings accessible from device Settings app
- [ ] Foreground: Notification banner appears while app is open
- [ ] Cold start: Tapping notification while app is killed navigates correctly
- [ ] Sign-out: Token is removed; no more notifications received
- [ ] Re-sign-in: Token is re-registered; notifications resume
- [ ] Permission denied: Graceful fallback; no crashes
- [ ] Offline: Token registration retries silently on next launch

---

## 11. Implementation Phases

### Phase 1 -- Token Infrastructure & Permission Flow (~1 week)

**Goal**: Install dependencies, create database tables, implement token registration and permission handling. No notifications are sent yet.

**Scope:**
- [ ] Install `expo-notifications` and `expo-device` via `npx expo install`
- [ ] Add `"expo-notifications"` to `app.config.js` plugins array
- [ ] Create `push_tokens` table migration
- [ ] Create `notification_preferences` table migration
- [ ] Create `push_notification_log` table migration
- [ ] Regenerate `database.types.ts` with new table types
- [ ] Implement `lib/push-notification-service.ts` (permissions, token registration, channels, handlers)
- [ ] Implement `hooks/use-push-notifications.ts`
- [ ] Integrate `usePushNotifications()` into `app/_layout.tsx` `RootLayoutNav`
- [ ] Add `unregisterPushToken()` to sign-out flow
- [ ] Configure Android notification channels (default, reminders, social, digest)
- [ ] Set up FCM credentials in EAS Dashboard (required for Android push delivery)
- [ ] Verify APNs credentials in EAS Dashboard (should already exist from Apple Sign In config)
- [ ] Unit tests for push notification service and hook
- [ ] Run `npm run lint && npx tsc --noEmit && npm test` to verify

**Dependencies**: None. Can start immediately.

**Verification**: On a development build on a physical device, tap a temporary "Test Push" button, see permission prompt, grant it, and verify token appears in `push_tokens` table via Supabase Dashboard.

### Phase 2 -- Generic Send Function & First Consumer (~1 week)

**Goal**: Implement the server-side push sender and connect the first consumer feature (release reminders from `PRD-release-calendar.md` Phase 3).

**Scope:**
- [ ] Generate Expo access token in Expo Dashboard and set as Supabase secret (`EXPO_ACCESS_TOKEN`)
- [ ] Implement `supabase/functions/send-push-notification/index.ts` (generic sender)
- [ ] Implement `supabase/functions/check-push-receipts/index.ts` (receipt checker)
- [ ] Set up `pg_cron` job for receipt checking (every 15 minutes)
- [ ] Set up `pg_cron` job for stale token cleanup (weekly, 90-day threshold)
- [ ] Store Vault secrets for project URL and service role key
- [ ] Connect first consumer: release reminder bell button on calendar release cards
  - Bell tap calls `registerForPushNotifications()` (contextual permission request)
  - On success, stores reminder in `release_reminders` table (from `PRD-release-calendar.md`)
- [ ] Implement `supabase/functions/send-release-reminders/index.ts` (daily cron at 08:00 UTC)
- [ ] End-to-end test: set reminder -> cron fires -> push delivered -> tap navigates to movie detail

**Dependencies**: Phase 1 complete. Release calendar Phase 2 complete (already merged as PR #214).

**Verification**: Set a release reminder for a movie releasing tomorrow. Next morning at 08:00 UTC, receive push notification on physical device. Tap it, arrive at `app/movie/[id].tsx`.

### Phase 3 -- Social Notifications & Preferences UI (~1 week)

**Goal**: Connect social features (follow, like, comment) as push consumers. Build notification preferences screen.

**Scope:**
- [ ] Implement `supabase/functions/send-social-notification/index.ts` (triggered by database webhook on `notifications` table insert)
- [ ] Add notification preferences screen in Settings (`app/settings/notification-preferences.tsx`)
- [ ] Per-feature toggle UI: Release Reminders, Social, Weekly Digest
- [ ] Connect existing in-app notification creation to also trigger push delivery
- [ ] Ensure dual delivery: push notification + in-app `notifications` row for every push sent
- [ ] Weekly digest edge function and cron job (premium feature, scheduled for Monday 09:00 UTC)

**Dependencies**: Phase 2 complete. Social features already exist (follows, likes, comments already create `notifications` rows in the database).

### Phase 4 -- Polish & Monitoring (~3-5 days)

**Goal**: Production hardening, monitoring, and user experience refinements.

**Scope:**
- [ ] Sentry integration for push failures (capture critical errors like `InvalidCredentials`)
- [ ] Dashboard analytics: delivery rate by feature, opt-in rates, token churn
- [ ] Rich notifications on iOS (movie poster image via `mutableContent` + notification service extension)
- [ ] Badge count management (increment on push, clear when app is opened or `app/notifications.tsx` is visited)
- [ ] Notification grouping (stack multiple notifications from same feature on Android)
- [ ] Performance: batch DB writes in sender, optimize cron query with proper indexes
- [ ] Documentation: update `CLAUDE.md` with push notification patterns and conventions

**Dependencies**: Phase 3 complete.

---

## 12. Consumer Integration Guide

Any feature that wants to send push notifications follows this pattern:

### Step 1: Define your feature key

Choose a unique string identifier (e.g., `'release_reminder'`, `'social'`, `'weekly_digest'`). This key is used in:
- `push_notification_log.feature` column for per-feature analytics
- `notification_preferences.feature` column for per-feature user opt-out

### Step 2: Trigger token registration (client-side)

When the user performs an action that requires push (e.g., tapping a reminder bell):

```typescript
import { registerForPushNotifications } from '@/lib/push-notification-service';

const handleSetReminder = async () => {
  const { success } = await registerForPushNotifications();
  if (!success) {
    // Show fallback (in-app toast, etc.)
    return;
  }
  // Save the reminder to your feature's table
  await saveReminder(movieId, releaseDate);
};
```

### Step 3: Create a sender edge function (server-side)

Create a new edge function (e.g., `send-release-reminders`) that:
1. Queries your feature's pending work table (e.g., `release_reminders WHERE remind_at <= now() AND sent = false`)
2. Builds notification content: `title`, `body`, and `data` with a `url` field for deep linking
3. Calls the generic `send-push-notification` edge function (internal HTTP call with service_role key) or uses the Expo Push API directly

### Step 4: Schedule with pg_cron

Set up a cron job to invoke your sender function at the appropriate interval (e.g., daily at 08:00 UTC for reminders, weekly for digests).

### Step 5: Dual delivery

When sending a push, also insert a row into the existing `notifications` table (the one powering `lib/notification-service.ts`) so the notification appears in the in-app notification list at `app/notifications.tsx` as well.

---

## 13. Success Metrics

### 13.1 Infrastructure Health

| Metric | Target |
|--------|--------|
| Push delivery rate (sent / attempted) | >= 95% |
| Invalid token rate (invalid_token / total tokens) | < 5% |
| Receipt check latency (time from send to receipt update) | < 30 minutes |
| Token registration success rate (on physical devices) | >= 90% |

### 13.2 User Engagement

| Metric | Target (30 days post-launch) |
|--------|------------------------------|
| Push opt-in rate (granted / prompted) | >= 50% |
| Notification tap-through rate (tapped / delivered) | >= 15% |
| Token churn (unregistered tokens / total per month) | < 10% |
| Users with active tokens / Total authenticated users | >= 40% after 3 months |

### 13.3 Per-Feature Metrics

Tracked via `push_notification_log.feature` column:

| Metric | Measurement |
|--------|-------------|
| Volume by feature | Count of log rows grouped by `feature` per day |
| Delivery rate by feature | `status = 'delivered'` / `status = 'sent'` per feature |
| Opt-out rate by feature | `notification_preferences WHERE enabled = false` / total users, per feature |

---

## 14. Future Considerations

### 14.1 Rich Notifications

- **iOS**: Use `expo-notifications` with `mutableContent: true` to attach movie poster images via a notification service extension
- **Android**: Support BigPicture notification style for movie poster display
- **Both**: Action buttons on notifications ("Add to Watchlist", "Dismiss") via notification categories/actions

### 14.2 Local Notification Scheduling

For time-sensitive features (e.g., "Your movie starts in 30 minutes" based on showtime from ticket scan data), consider local notifications via `Notifications.scheduleNotificationAsync()` that do not require a server round-trip.

### 14.3 Web Push

Web push notifications are not supported by Expo's push service. If web push becomes a priority, evaluate:
- Service workers with the Web Push API
- Third-party services (OneSignal, Firebase Cloud Messaging for web)
- The web app currently runs as a static site (`app.config.js` has `web.output: "static"`) which limits service worker integration

### 14.4 Analytics Integration

- Track notification tap events as conversion events
- A/B test notification content (title/body variations) per feature
- Optimal send time personalization based on user activity patterns (when do they typically open the app?)

### 14.5 Notification Center Enhancements

- Combine push delivery with real-time in-app updates via Supabase Realtime subscriptions on the `notifications` table
- Unread badge on the tab bar / header notification icon, synced with push delivery count
- "Mute for X hours" do-not-disturb feature in notification preferences

---

## Appendix A: Key File Paths (New)

| File | Purpose |
|------|---------|
| `lib/push-notification-service.ts` | Core push notification client (permissions, tokens, channels, handlers) |
| `hooks/use-push-notifications.ts` | React hook for push state, registration, and listener lifecycle |
| `supabase/functions/send-push-notification/index.ts` | Generic push sender edge function (internal only) |
| `supabase/functions/check-push-receipts/index.ts` | Receipt checking edge function (cron) |
| `supabase/functions/send-release-reminders/index.ts` | Release reminder consumer (first consumer, daily cron) |
| `app/settings/notification-preferences.tsx` | User notification preferences screen |

## Appendix B: Key File Paths (Existing, Referenced)

| File | Relevance |
|------|-----------|
| `lib/notification-service.ts` | Existing in-app notification CRUD -- push should also create in-app entries |
| `hooks/use-notifications.ts` | Existing in-app notification hook -- remains unchanged |
| `app/notifications.tsx` | Existing notification list screen -- remains unchanged |
| `components/social/NotificationItem.tsx` | Existing notification item renderer -- remains unchanged |
| `lib/deep-link-handler.ts` | Auth deep links -- push deep links use a separate mechanism (no conflict) |
| `app/_layout.tsx` | Root layout where `usePushNotifications()` is integrated in `RootLayoutNav` |
| `app.config.js` | App config where `expo-notifications` plugin is added to plugins array |
| `lib/supabase.ts` | Supabase client used by push token upsert/delete operations |
| `supabase/functions/_shared/cors.ts` | CORS utility -- not needed for internal-only push sender |
| `supabase/functions/_shared/rate-limit.ts` | Rate limit utility -- reused by consumer edge functions |
| `supabase/functions/_shared/cost-tracking.ts` | Cost tracking -- not used by push (Expo Push Service is free) |
| `supabase/functions/check-achievements/index.ts` | Reference for edge function boilerplate pattern (auth, admin client, error handling) |

## Appendix C: Expo Push Message Format Reference

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "title": "Thunderbolts* releases today!",
  "body": "The movie you have been waiting for is now in theaters.",
  "data": {
    "url": "/movie/986056",
    "feature": "release_reminder",
    "tmdb_id": 986056
  },
  "sound": "default",
  "channelId": "reminders",
  "priority": "high",
  "badge": 1
}
```

**Payload size constraint**: The total message payload must be at most 4096 bytes across all platforms. The `data` field should contain only essential routing information (URL + feature key), not full movie metadata.

## Appendix D: Platform Differences

| Aspect | iOS | Android |
|--------|-----|---------|
| Permission prompt | System dialog; one chance (if denied, user must go to device Settings) | Auto-granted on Android 12 and below; system dialog required on Android 13+ |
| Notification channels | Not applicable (iOS uses categories) | Required; created via `setupNotificationChannels()` |
| Credentials | APNs key (managed automatically by EAS Build) | FCM via `google-services.json` + Service Account Key in EAS Dashboard |
| Rich media | Notification Service Extension (requires native module) | BigPicture style (simpler, no native extension needed) |
| Badge count | Native badge on app icon; well-supported | Depends on device launcher; not universally supported |
| Sound | Default system sound or custom audio file | Channel-level sound setting |
| Grouping | Automatic grouping by thread identifier | Notification group with explicit summary notification |
