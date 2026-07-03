import { renderHook, act } from '@testing-library/react-native';
import { useStatsV2, STATS_V2_FLAG } from '@/hooks/use-stats-v2';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: jest.fn() },
}));

const getFeatureFlag = analytics.getFeatureFlag as jest.Mock;

describe('useStatsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns v2 when the stats_v2 flag is enabled', () => {
    getFeatureFlag.mockReturnValue(true);

    const { result } = renderHook(() => useStatsV2());

    expect(getFeatureFlag).toHaveBeenCalledWith(STATS_V2_FLAG);
    expect(result.current).toEqual({ variant: 'v2', resolving: false });
  });

  it('returns v2 for a string variant value', () => {
    getFeatureFlag.mockReturnValue('test');

    const { result } = renderHook(() => useStatsV2());

    expect(result.current).toEqual({ variant: 'v2', resolving: false });
  });

  it('returns v1 when the flag is disabled', () => {
    getFeatureFlag.mockReturnValue(false);

    const { result } = renderHook(() => useStatsV2());

    expect(result.current).toEqual({ variant: 'v1', resolving: false });
  });

  it("returns v1 for the string 'false'", () => {
    getFeatureFlag.mockReturnValue('false');

    const { result } = renderHook(() => useStatsV2());

    expect(result.current).toEqual({ variant: 'v1', resolving: false });
  });

  it('resolves to v2 once PostHog loads the flag', () => {
    getFeatureFlag.mockReturnValue(undefined);

    const { result } = renderHook(() => useStatsV2());
    expect(result.current).toEqual({ variant: 'v1', resolving: true });

    getFeatureFlag.mockReturnValue(true);
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current).toEqual({ variant: 'v2', resolving: false });
  });

  it('falls back to v1 when the flag never resolves', () => {
    getFeatureFlag.mockReturnValue(undefined);

    const { result } = renderHook(() => useStatsV2());
    expect(result.current.resolving).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(result.current).toEqual({ variant: 'v1', resolving: false });
  });
});
