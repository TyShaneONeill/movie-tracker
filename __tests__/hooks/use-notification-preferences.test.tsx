import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationPreference } from '@/hooks/use-notification-preferences';
import * as service from '@/lib/notification-preferences-service';

jest.mock('@/lib/notification-preferences-service');

const getMock = service.getNotificationPreference as jest.Mock;
const setMock = service.setNotificationPreference as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useNotificationPreference', () => {
  it('returns enabled=true on initial fetch when service returns true', async () => {
    getMock.mockResolvedValue(true);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(getMock).toHaveBeenCalledWith('release_reminders');
  });

  it('returns enabled=false when service returns false', async () => {
    getMock.mockResolvedValue(false);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it('setEnabled invokes the service and refreshes the query', async () => {
    getMock.mockResolvedValue(true);
    setMock.mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    getMock.mockResolvedValue(false);
    await act(async () => {
      result.current.setEnabled(false);
    });
    await waitFor(() => expect(setMock).toHaveBeenCalledWith('release_reminders', false));
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });
});
