import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import * as prefService from '@/lib/notification-preferences-service';
import * as pushHook from '@/hooks/use-push-notifications';
import * as analyticsModule from '@/lib/analytics';

jest.mock('@/lib/notification-preferences-service', () => ({
  getNotificationPreference: jest.fn(),
  setNotificationPreference: jest.fn(),
}));
jest.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

const getPrefMock = prefService.getNotificationPreference as jest.Mock;
const setPrefMock = prefService.setNotificationPreference as jest.Mock;
const usePushMock = pushHook.usePushNotifications as jest.Mock;
const trackSpy = jest.spyOn(analyticsModule.analytics, 'track');
const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

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

  it('renders both per-feature toggles defaulting OFF when no DB rows exist', async () => {
    getPrefMock.mockResolvedValue(null);
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders', {}, { timeout: 8000 });
    const tv = await findByLabelText('TV episode reminders');
    expect(release.props.accessibilityState.checked).toBe(false);
    expect(tv.props.accessibilityState.checked).toBe(false);
  }, 15000);

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

  it('tapping master toggle while granted opens iOS Settings', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications');
    fireEvent(master, 'valueChange', false);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
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

  it('tapping Open Settings link calls Linking.openURL with app-settings:', async () => {
    const { findByText } = render(<NotificationsSettingsScreen />, { wrapper });
    const link = await findByText(/open settings/i);
    fireEvent.press(link);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
});
