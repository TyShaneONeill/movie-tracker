import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { analytics } from '@/lib/analytics';
import { useOutdatedBinaryNudge } from '@/hooks/use-outdated-binary-nudge';

// AsyncStorage is mocked globally in __tests__/setup.ts.
jest.mock('expo-updates', () => ({ runtimeVersion: '1.6.0' }));
jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
    getFeatureFlag: jest.fn(),
    getFeatureFlagPayload: jest.fn(),
    onFeatureFlags: jest.fn(() => () => {}),
  },
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const trackMock = analytics.track as jest.Mock;
const getFlagMock = analytics.getFeatureFlag as jest.Mock;
const getPayloadMock = analytics.getFeatureFlagPayload as jest.Mock;
const onFlagsMock = analytics.onFeatureFlags as jest.Mock;
const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

/** expo-updates is mocked as a plain object, so runtimeVersion is writable. */
function setRuntimeVersion(version: string | null) {
  (Updates as { runtimeVersion: string | null }).runtimeVersion = version;
}

beforeEach(() => {
  jest.clearAllMocks();
  setRuntimeVersion('1.6.0');
  getItemMock.mockResolvedValue(null);
  getFlagMock.mockReturnValue(true);
  getPayloadMock.mockReturnValue({ recommended: '1.6.1' });
  onFlagsMock.mockReturnValue(() => {});
  openURLSpy.mockResolvedValue(true);
});

describe('useOutdatedBinaryNudge', () => {
  it('shows the recommended tier for a binary behind the store', async () => {
    const { result } = renderHook(() => useOutdatedBinaryNudge());

    await waitFor(() => expect(result.current.tier).toBe('recommended'));
    expect(result.current.targetVersion).toBe('1.6.1');
    expect(trackMock).toHaveBeenCalledWith('version_nudge_shown', {
      tier: 'recommended',
      current_version: '1.6.0',
      target_version: '1.6.1',
    });
  });

  it('shows the minimum tier, which the snooze can never suppress', async () => {
    getPayloadMock.mockReturnValue({ recommended: '1.6.1', minimum: '1.6.1' });
    getItemMock.mockResolvedValue(
      JSON.stringify({ version: '1.6.1', snoozedAt: Date.now() })
    );

    const { result } = renderHook(() => useOutdatedBinaryNudge());

    await waitFor(() => expect(result.current.tier).toBe('minimum'));
    expect(result.current.targetVersion).toBe('1.6.1');
  });

  it('stays hidden while the snooze read is outstanding, then reveals', async () => {
    let resolveRead: (value: string | null) => void = () => {};
    getItemMock.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveRead = resolve;
      })
    );

    const { result } = renderHook(() => useOutdatedBinaryNudge());

    expect(result.current.tier).toBe('none');
    expect(trackMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveRead(null);
    });
    expect(result.current.tier).toBe('recommended');
  });

  it('hides while snoozed and resurfaces once the window lapses', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    getItemMock.mockResolvedValue(JSON.stringify({ version: '1.6.1', snoozedAt: Date.now() }));

    const snoozed = renderHook(() => useOutdatedBinaryNudge());
    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(snoozed.result.current.tier).toBe('none');

    getItemMock.mockResolvedValue(JSON.stringify({ version: '1.6.1', snoozedAt: eightDaysAgo }));
    const lapsed = renderHook(() => useOutdatedBinaryNudge());
    await waitFor(() => expect(lapsed.result.current.tier).toBe('recommended'));
  });

  it('dismissal hides the banner immediately and records the snooze', async () => {
    const { result } = renderHook(() => useOutdatedBinaryNudge());
    await waitFor(() => expect(result.current.tier).toBe('recommended'));

    await act(async () => {
      result.current.onDismiss();
    });

    expect(result.current.tier).toBe('none');
    expect(trackMock).toHaveBeenCalledWith('version_nudge_dismissed', {
      target_version: '1.6.1',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('stays hidden when the flag is off — the payload is never consulted', async () => {
    getFlagMock.mockReturnValue(false);

    const { result } = renderHook(() => useOutdatedBinaryNudge());

    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(result.current.tier).toBe('none');
    expect(getPayloadMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('re-reads the config once PostHog reports flags resolved', async () => {
    // First render sees an unresolved flag, as it does on a real cold start.
    getFlagMock.mockReturnValueOnce(undefined);
    let notifyFlagsReady: () => void = () => {};
    onFlagsMock.mockImplementation((callback: () => void) => {
      notifyFlagsReady = callback;
      return () => {};
    });

    const { result } = renderHook(() => useOutdatedBinaryNudge());
    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(result.current.tier).toBe('none');

    await act(async () => {
      notifyFlagsReady();
    });
    expect(result.current.tier).toBe('recommended');
  });

  it('stays hidden when the binary is already current', async () => {
    setRuntimeVersion('1.6.1');

    const { result } = renderHook(() => useOutdatedBinaryNudge());

    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(result.current.tier).toBe('none');
  });

  it('stays hidden when the runtime version is unknown', async () => {
    setRuntimeVersion(null);

    const { result } = renderHook(() => useOutdatedBinaryNudge());

    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(result.current.tier).toBe('none');
  });

  it('tapping update fires the tap event and opens the tagged store listing', async () => {
    const { result } = renderHook(() => useOutdatedBinaryNudge());
    await waitFor(() => expect(result.current.tier).toBe('recommended'));

    act(() => {
      result.current.onUpdate();
    });

    expect(trackMock).toHaveBeenCalledWith('version_nudge_tapped', {
      tier: 'recommended',
      current_version: '1.6.0',
      target_version: '1.6.1',
    });
    expect(openURLSpy).toHaveBeenCalledWith(expect.stringContaining('app-update-nudge'));
  });
});
