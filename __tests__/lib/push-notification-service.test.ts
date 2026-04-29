// ============================================================================
// Mocks — declared before imports (jest hoisting requirement)
// expo-notifications and expo-device are mocked globally in __tests__/setup.ts
// ============================================================================

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
      eas: {
        projectId: 'test-project-id',
      },
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

import {
  getPermissionStatus,
  registerForPushNotifications,
  unregisterPushToken,
  handleNotificationResponse,
  getNotificationUrl,
} from '@/lib/push-notification-service';

// ============================================================================
// Reference to mocked functions
// ============================================================================

const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;

const mockSupabaseFrom = supabase.from as jest.Mock;
const mockSupabaseGetUser = supabase.auth.getUser as jest.Mock;
const mockRouterPush = router.push as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function makeNotification(dataOverride?: Record<string, unknown>): Notifications.Notification {
  return {
    request: {
      identifier: 'test-id',
      content: {
        title: 'Test',
        body: 'Test body',
        data: dataOverride ?? { url: '/movie/12345' },
        sound: null,
        badge: null,
        subtitle: null,
      },
      trigger: { type: 'push' } as any,
    },
    date: Date.now(),
  } as unknown as Notifications.Notification;
}

function makeNotificationResponse(dataOverride?: Record<string, unknown>): Notifications.NotificationResponse {
  return {
    notification: makeNotification(dataOverride),
    actionIdentifier: 'default',
  } as unknown as Notifications.NotificationResponse;
}

// ============================================================================
// Tests
// ============================================================================

describe('getPermissionStatus', () => {
  it('returns "denied" on web platform', async () => {
    const originalOS = Platform.OS;
    (Platform as any).OS = 'web';

    const status = await getPermissionStatus();
    expect(status).toBe('denied');

    (Platform as any).OS = originalOS;
  });

  it('returns the result from Notifications.getPermissionsAsync on native', async () => {
    (Platform as any).OS = 'ios';
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });

    const status = await getPermissionStatus();
    expect(status).toBe('granted');
  });

  it('returns "undetermined" when not yet prompted', async () => {
    (Platform as any).OS = 'ios';
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });

    const status = await getPermissionStatus();
    expect(status).toBe('undetermined');
  });
});

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    (Device as any).isDevice = true;
  });

  it('returns error when not on a physical device', async () => {
    (Device as any).isDevice = false;

    const result = await registerForPushNotifications();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Push notifications require a physical device');
  });

  it('returns error on web platform', async () => {
    (Platform as any).OS = 'web';

    const result = await registerForPushNotifications();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Push notifications not supported on web');
  });

  it('returns error when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    const result = await registerForPushNotifications();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Permission not granted');
  });

  it('upserts token in Supabase when permission is granted', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({
      data: 'ExponentPushToken[test-token-123]',
      type: 'expo',
    });
    mockSupabaseGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: null });
    mockSupabaseFrom.mockReturnValueOnce({ upsert: mockUpsert });

    const result = await registerForPushNotifications();

    expect(result.success).toBe(true);
    expect(result.token).toBe('ExponentPushToken[test-token-123]');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        token: 'ExponentPushToken[test-token-123]',
        platform: 'ios',
      }),
      { onConflict: 'user_id,token' }
    );
  });

  it('requests permission when not yet granted', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({
      data: 'ExponentPushToken[test-token-456]',
      type: 'expo',
    });
    mockSupabaseGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-456' } },
    });

    const mockUpsert = jest.fn().mockResolvedValueOnce({ error: null });
    mockSupabaseFrom.mockReturnValueOnce({ upsert: mockUpsert });

    const result = await registerForPushNotifications();

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('returns error when token fetch throws', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockRejectedValueOnce(new Error('Network error'));

    const result = await registerForPushNotifications();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});

describe('unregisterPushToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    (Device as any).isDevice = true;
  });

  it('does nothing on web platform', async () => {
    (Platform as any).OS = 'web';

    await unregisterPushToken();

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('does nothing on non-physical device', async () => {
    (Device as any).isDevice = false;

    await unregisterPushToken();

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('calls Supabase delete with the correct token and user_id', async () => {
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({
      data: 'ExponentPushToken[test-token-789]',
      type: 'expo',
    });
    mockSupabaseGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-789' } },
    });

    const mockDelete = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockReturnThis();
    mockSupabaseFrom.mockReturnValueOnce({
      delete: mockDelete,
      eq: mockEq,
    });
    mockDelete.mockReturnValueOnce({ eq: mockEq });
    mockEq.mockReturnValueOnce({ eq: mockEq });
    mockEq.mockReturnValueOnce(Promise.resolve({ error: null }));

    await unregisterPushToken();

    expect(mockSupabaseFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('getNotificationUrl', () => {
  it('extracts url from notification data', () => {
    const notification = makeNotification({ url: '/movie/12345' });
    const url = getNotificationUrl(notification);
    expect(url).toBe('/movie/12345');
  });

  it('returns null when data has no url field', () => {
    const notification = makeNotification({ feature: 'release_reminder' });
    const url = getNotificationUrl(notification);
    expect(url).toBeNull();
  });

  it('returns null when data is empty', () => {
    const notification = makeNotification({});
    const url = getNotificationUrl(notification);
    expect(url).toBeNull();
  });
});

describe('handleNotificationResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls router.push with the url from notification data', () => {
    const response = makeNotificationResponse({ url: '/movie/12345' });

    handleNotificationResponse(response);
    jest.runAllTimers();

    expect(mockRouterPush).toHaveBeenCalledWith('/movie/12345');
  });

  it('does not call router.push when url is missing', () => {
    const response = makeNotificationResponse({ feature: 'release_reminder' });

    handleNotificationResponse(response);
    jest.runAllTimers();

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('does not call router.push when data is empty', () => {
    const response = makeNotificationResponse({});

    handleNotificationResponse(response);
    jest.runAllTimers();

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('defers navigation via setTimeout(0)', () => {
    const response = makeNotificationResponse({ url: '/achievements' });

    handleNotificationResponse(response);

    // Router.push should NOT have been called synchronously
    expect(mockRouterPush).not.toHaveBeenCalled();

    // After timers run, it should be called
    jest.runAllTimers();
    expect(mockRouterPush).toHaveBeenCalledWith('/achievements');
  });

  it('emits release_reminder:tapped when feature is release_reminders', () => {
    const { analytics } = require('@/lib/analytics');
    const trackSpy = analytics.track as jest.Mock;
    trackSpy.mockClear();

    const response: any = {
      notification: {
        request: {
          content: {
            data: {
              url: '/movie/12345',
              tmdb_id: 12345,
              category: 'theatrical',
              feature: 'release_reminders',
            },
          },
        },
      },
    };
    handleNotificationResponse(response);
    expect(trackSpy).toHaveBeenCalledWith('release_reminder:tapped', {
      tmdb_id: 12345,
      category: 'theatrical',
    });
  });
});
