import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import * as prefService from '@/lib/notification-preferences-service';
import * as pushHook from '@/hooks/use-push-notifications';
import * as analyticsModule from '@/lib/analytics';
import Toast from 'react-native-toast-message';

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

// Memoize QueryClient via useState so re-renders inside tests don't reset cache
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

describe('NotificationsSettingsScreen', () => {
  it('renders the Release reminders toggle', async () => {
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    expect(await findByLabelText('Release reminders')).toBeTruthy();
  });

  it('toggling ON requests permission and persists when granted', async () => {
    const requestPermission = jest.fn().mockResolvedValue(true);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: true,
    });
  });

  it('toggling ON when permission denied surfaces toast and does NOT persist', async () => {
    const requestPermission = jest.fn().mockResolvedValue(false);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    expect(setPrefMock).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
  });

  it('toggling OFF persists enabled=false without re-requesting permission', async () => {
    getPrefMock.mockResolvedValue(true);
    const requestPermission = jest.fn();
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', false)
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: false,
    });
  });

  it('toggling ON when permission already granted skips the prompt', async () => {
    const requestPermission = jest.fn();
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
