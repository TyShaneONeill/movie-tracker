import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';
import { analytics } from '@/lib/analytics';
import {
  FIRST_LAUNCH_KEY,
  getFirstLaunch,
  __resetFirstLaunchCache,
} from '@/lib/first-launch';

// AsyncStorage and @/lib/sentry are mocked globally in __tests__/setup.ts.
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));

describe('getFirstLaunch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFirstLaunchCache();
  });

  it('detects a first launch, persists the flag, and tracks the event once', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { isFirstLaunch } = await getFirstLaunch();

    expect(isFirstLaunch).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      FIRST_LAUNCH_KEY,
      expect.any(String),
    );
    expect(analytics.track).toHaveBeenCalledWith('app:first_open');
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('detects a returning user without re-persisting or tracking', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      '2026-06-16T00:00:00.000Z',
    );

    const { isFirstLaunch } = await getFirstLaunch();

    expect(isFirstLaunch).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('reads and writes storage exactly once per process (memoised)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await getFirstLaunch();
    await getFirstLaunch();

    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('treats a storage failure as a returning user and reports it', async () => {
    const boom = new Error('storage unavailable');
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(boom);

    const { isFirstLaunch } = await getFirstLaunch();

    expect(isFirstLaunch).toBe(false);
    expect(captureException).toHaveBeenCalledWith(boom, {
      context: 'first-launch:resolve',
    });
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
