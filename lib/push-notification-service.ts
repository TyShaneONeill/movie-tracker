import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { analytics } from './analytics';
import { episodeRoomsEnabled } from '@/hooks/use-episode-rooms-enabled';
import { episodeRoomSlug } from '@/lib/episode-room-logic';

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

const PUSH_PERMISSION_STORAGE_KEY = 'push.last_known_permission';

// Single-flight guard (PS-15 PR 2): the mount-effect and foreground-listener
// callers in use-push-notifications.ts can both invoke this within ~5ms of
// each other on a real device. Without this, both read AsyncStorage before
// either writes, so both see the same stale `lastKnown` and both fire
// `push:permission_changed` for the same transition. A second concurrent
// call now awaits the first call's in-flight promise instead of re-running.
let inFlightSync: Promise<PushPermissionStatus> | null = null;

/**
 * Check current permission status (never prompts — wraps getPermissionStatus),
 * sync the `push_permission` person property, and fire `push:permission_changed`
 * when it differs from the last-known value persisted in AsyncStorage.
 * PS-15 PR 0 — call on app foreground/init, not just once at cold start.
 */
export async function syncPushPermissionState(): Promise<PushPermissionStatus> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = performPushPermissionSync().finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
}

async function performPushPermissionSync(): Promise<PushPermissionStatus> {
  const status = await getPermissionStatus();

  analytics.setPersonProperties({ push_permission: status });

  try {
    const lastKnown = await AsyncStorage.getItem(PUSH_PERMISSION_STORAGE_KEY);
    if (lastKnown !== status) {
      analytics.track('push:permission_changed', {
        from: lastKnown,
        to: status,
        // PS-15 PR 2 (#625 LOW): the first-ever capture fires with
        // from:null — flag it so funnels can exclude it from "changed"
        // counts without suppressing the useful initial-state data.
        initial: lastKnown === null,
      });
      await AsyncStorage.setItem(PUSH_PERMISSION_STORAGE_KEY, status);
    }
  } catch {
    // AsyncStorage unavailable — skip the changed-event dedup for this check;
    // the person property above is already set regardless.
  }

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
    lightColor: '#e11d48', // PocketStubs tint color
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
  const data = response.notification.request.content.data;
  let url = getNotificationUrl(response.notification);

  // Fires for every tapped push, regardless of feature — makes
  // "notification-triggered session" measurable (PS-15 PR 0).
  analytics.track('push:open', {
    feature: data && typeof data.feature === 'string' ? data.feature : null,
    has_url: url !== null,
  });

  if (data && data.feature === 'release_reminders') {
    analytics.track('release_reminder:tapped', {
      tmdb_id: typeof data.tmdb_id === 'number' ? data.tmdb_id : null,
      category: typeof data.category === 'string' ? data.category : null,
    });
  }

  // Episode reminders: CLIENT-side upgrade to the Episode Room. The server
  // payload always ships /tv/{id} (reaches old bundles too), so this override is
  // the only thing that routes into the room — and only when this build has the
  // room route AND the flag is on. Old bundles never run this code, so they keep
  // the /tv/{id} destination regardless of when the edge function deploys.
  if (
    data &&
    data.feature === 'tv_episode_reminders' &&
    typeof data.tmdb_id === 'number' &&
    typeof data.season === 'number' &&
    typeof data.episode === 'number' &&
    episodeRoomsEnabled()
  ) {
    url = `/episode-room/${episodeRoomSlug(data.tmdb_id, data.season, data.episode)}`;
  }

  // Belt-and-braces: never leave a tap dead-ended. If there's no usable url but
  // the payload identifies a show, fall back to its detail page rather than
  // pushing nothing (or a route this build can't resolve).
  if (!url && data && typeof data.tmdb_id === 'number') {
    url = `/tv/${data.tmdb_id}`;
  }

  if (url) {
    const target = url;
    setTimeout(() => {
      router.push(target as any);
    }, 0);
  }
}
