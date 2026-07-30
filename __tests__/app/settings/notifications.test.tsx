import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import * as prefService from '@/lib/notification-preferences-service';
import * as pushHook from '@/hooks/use-push-notifications';
import * as analyticsModule from '@/lib/analytics';
import { usePremiumGate } from '@/hooks/use-premium';
import { router } from 'expo-router';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in
// transformIgnorePatterns. Reached here via PremiumBadge / UpgradePromptSheet.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/lib/notification-preferences-service', () => ({
  getNotificationPreference: jest.fn(),
  setNotificationPreference: jest.fn(),
  NOTIFICATION_FEATURE_DEFAULTS: {
    release_reminders: true,
    tv_episode_reminders: true,
    day2_bridge: true,
  },
}));
jest.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/hooks/use-premium', () => ({
  usePremiumGate: jest.fn(),
}));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

const getPrefMock = prefService.getNotificationPreference as jest.Mock;
const setPrefMock = prefService.setNotificationPreference as jest.Mock;
const usePushMock = pushHook.usePushNotifications as jest.Mock;
const usePremiumGateMock = usePremiumGate as jest.Mock;
const routerPushMock = router.push as jest.Mock;
const trackSpy = jest.spyOn(analyticsModule.analytics, 'track');
const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
const openSettingsSpy = jest
  .spyOn(Linking, 'openSettings')
  .mockResolvedValue(undefined);

function wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPrefMock.mockResolvedValue(false);
  setPrefMock.mockResolvedValue(undefined);
  // Default to an unlocked member so the pre-existing toggle expectations below
  // describe the member experience; the premium-gate block sets its own tiers.
  usePremiumGateMock.mockReturnValue({
    isUnlocked: true,
    isPremium: true,
    tier: 'plus',
    isLoading: false,
  });
});

describe('NotificationsSettingsScreen — undetermined permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('renders the master Push Notifications toggle in OFF state', async () => {
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    // CI runners are slower than local — findBy* defaults to 1s polling, which
    // races the React Query loading→data transition under worker resource
    // pressure. Allow 8s for the toggle to appear after ActivityIndicator.
    const master = await findByLabelText('Push Notifications', {}, { timeout: 8000 });
    expect(master.props.accessibilityState.checked).toBe(false);
    // Per-feature toggles hidden until permission is granted
    expect(queryByLabelText('Release reminders')).toBeNull();
    expect(queryByLabelText('TV episode reminders')).toBeNull();
  }, 15000);

  it('tapping master toggle calls requestPermission', async () => {
    const requestPermission = jest.fn().mockResolvedValue(true);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications');
    fireEvent(master, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
  });
});

describe('NotificationsSettingsScreen — granted permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('renders both per-feature toggles defaulting ON when no DB rows exist (PS-15 PR 0: matches delivery, which already sends to absent rows)', async () => {
    getPrefMock.mockResolvedValue(null);
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders', {}, { timeout: 8000 });
    const tv = await findByLabelText('TV episode reminders');
    expect(release.props.accessibilityState.checked).toBe(true);
    expect(tv.props.accessibilityState.checked).toBe(true);
  }, 15000);

  it('renders the day2_bridge toggle defaulting ON when no DB row exists (PS-15 PR 1)', async () => {
    getPrefMock.mockResolvedValue(null);
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const dayTwoBridge = await findByLabelText('Day-2 nudge', {}, { timeout: 8000 });
    expect(dayTwoBridge.props.accessibilityState.checked).toBe(true);
  }, 15000);

  it('toggling day2_bridge OFF calls setNotificationPreference and fires analytics', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const dayTwoBridge = await findByLabelText('Day-2 nudge');
    fireEvent(dayTwoBridge, 'valueChange', false);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('day2_bridge', false)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'day2_bridge',
      enabled: false,
    });
  });

  it('toggling release_reminders ON calls setNotificationPreference and fires analytics', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders');
    fireEvent(release, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: true,
    });
  });

  it('toggling tv_episode_reminders ON calls setNotificationPreference with the right key', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const tv = await findByLabelText('TV episode reminders');
    fireEvent(tv, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('tv_episode_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'tv_episode_reminders',
      enabled: true,
    });
  });

  it('toggling release_reminders OFF persists enabled=false', async () => {
    getPrefMock.mockResolvedValue(true);
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders');
    fireEvent(release, 'valueChange', false);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', false)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: false,
    });
  });

  it('tapping master toggle while granted opens iOS Settings', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications');
    fireEvent(master, 'valueChange', false);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
});

describe('NotificationsSettingsScreen — release reminders premium gate', () => {
  const LOCKED_LABEL = 'Release reminders. PocketStubs+ feature. Tap to upgrade.';

  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  function mockTier(tier: string, isUnlocked: boolean, isLoading = false) {
    usePremiumGateMock.mockReturnValue({
      isUnlocked,
      isPremium: tier === 'plus' || tier === 'dev',
      tier,
      isLoading,
    });
  }

  it('free: locks the row — no switch is mounted, so there is no write path to the preference', async () => {
    mockTier('free', false);
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, {
      wrapper,
    });
    await findByLabelText(LOCKED_LABEL, {}, { timeout: 8000 });
    expect(queryByLabelText('Release reminders')).toBeNull();
    // The other, non-premium toggles are untouched.
    await findByLabelText('TV episode reminders');
  }, 15000);

  it('free: tapping the locked row fires premium:gate_hit and opens the upgrade sheet', async () => {
    mockTier('free', false);
    const { findByLabelText, findByText } = render(<NotificationsSettingsScreen />, { wrapper });
    const locked = await findByLabelText(LOCKED_LABEL, {}, { timeout: 8000 });
    fireEvent.press(locked);
    expect(trackSpy).toHaveBeenCalledWith('premium:gate_hit', {
      feature: 'release_reminders',
    });
    await findByText('See Plans');
    expect(setPrefMock).not.toHaveBeenCalled();
  }, 15000);

  it('free: See Plans routes to /upgrade with this gate’s own source for attribution', async () => {
    mockTier('free', false);
    const { findByLabelText, findByText } = render(<NotificationsSettingsScreen />, { wrapper });
    fireEvent.press(await findByLabelText(LOCKED_LABEL, {}, { timeout: 8000 }));
    fireEvent.press(await findByText('See Plans'));
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith(
        '/upgrade?source=settings-notifications-release-reminders'
      )
    );
  }, 15000);

  it('plus: renders the real toggle and persists changes', async () => {
    mockTier('plus', true);
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, {
      wrapper,
    });
    const release = await findByLabelText('Release reminders', {}, { timeout: 8000 });
    expect(queryByLabelText(LOCKED_LABEL)).toBeNull();
    fireEvent(release, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
  }, 15000);

  it('dev: renders the real toggle', async () => {
    mockTier('dev', true);
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, {
      wrapper,
    });
    await findByLabelText('Release reminders', {}, { timeout: 8000 });
    expect(queryByLabelText(LOCKED_LABEL)).toBeNull();
  }, 15000);

  it('while the tier is still loading: stays unlocked so a member never sees a lock flash on cold start', async () => {
    mockTier('free', false, true);
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, {
      wrapper,
    });
    await findByLabelText('Release reminders', {}, { timeout: 8000 });
    expect(queryByLabelText(LOCKED_LABEL)).toBeNull();
  }, 15000);
});

describe('NotificationsSettingsScreen — denied permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'denied',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('shows Open Settings link and hides per-feature section', async () => {
    const { findByLabelText, queryByLabelText, findByText } = render(
      <NotificationsSettingsScreen />,
      { wrapper }
    );
    const master = await findByLabelText('Push Notifications', {}, { timeout: 8000 });
    expect(master.props.accessibilityState.checked).toBe(false);
    expect(queryByLabelText('Release reminders')).toBeNull();
    expect(queryByLabelText('TV episode reminders')).toBeNull();
    await findByText(/open settings/i);
  }, 15000);

  it('tapping Open Settings link calls Linking.openURL with app-settings: (iOS)', async () => {
    const { findByText } = render(<NotificationsSettingsScreen />, { wrapper });
    const link = await findByText(/open settings/i);
    fireEvent.press(link);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
});

describe('NotificationsSettingsScreen — Android platform', () => {
  let originalOS: typeof Platform.OS;
  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('granted: tapping master toggle opens device settings via openSettings, not app-settings:', async () => {
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications', {}, { timeout: 8000 });
    fireEvent(master, 'valueChange', false);
    await waitFor(() => expect(openSettingsSpy).toHaveBeenCalledTimes(1));
    expect(openURLSpy).not.toHaveBeenCalledWith('app-settings:');
  }, 15000);

  it('denied: shows device-settings copy (not "iOS Settings") and Open Settings calls openSettings', async () => {
    usePushMock.mockReturnValue({
      permissionStatus: 'denied',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
    const { findByText, queryByText } = render(<NotificationsSettingsScreen />, { wrapper });
    const link = await findByText(/open settings/i, {}, { timeout: 8000 });
    expect(queryByText(/iOS Settings/i)).toBeNull();
    await findByText(/your device settings/i);
    fireEvent.press(link);
    await waitFor(() => expect(openSettingsSpy).toHaveBeenCalledTimes(1));
    expect(openURLSpy).not.toHaveBeenCalledWith('app-settings:');
  }, 15000);
});
