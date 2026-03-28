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
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
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
