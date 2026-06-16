import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFirstLaunch } from '@/hooks/use-first-launch';
import { __resetFirstLaunchCache } from '@/lib/first-launch';

// AsyncStorage and @/lib/sentry are mocked globally in __tests__/setup.ts.
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));

describe('useFirstLaunch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFirstLaunchCache();
  });

  it('starts loading, then reports a first launch', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useFirstLaunch());

    expect(result.current).toEqual({ isFirstLaunch: null, isLoading: true });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFirstLaunch).toBe(true);
  });

  it('reports a returning user when the flag is already set', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      '2026-06-16T00:00:00.000Z',
    );

    const { result } = renderHook(() => useFirstLaunch());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFirstLaunch).toBe(false);
  });

  it('reads storage once even with multiple consumers in the same process', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    renderHook(() => useFirstLaunch());
    renderHook(() => useFirstLaunch());

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });
});
