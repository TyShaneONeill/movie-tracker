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
  const url = getNotificationUrl(response.notification);
  if (url) {
    setTimeout(() => {
      router.push(url as any);
    }, 0);
  }
}
