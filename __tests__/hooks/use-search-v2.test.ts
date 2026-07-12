import { renderHook, act } from '@testing-library/react-native';
import { useSearchV2, SEARCH_V2_FLAG } from '@/hooks/use-search-v2';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: jest.fn() },
}));

const getFeatureFlag = analytics.getFeatureFlag as jest.Mock;

// Locks the PostHog variant-string enable guard: a string flag value must only
// enable v2 when it is truthy-and-not-'false' (mirrors use-first-takes-v2).
describe('useSearchV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enables v2 when the flag is boolean true', () => {
    getFeatureFlag.mockReturnValue(true);
    const { result } = renderHook(() => useSearchV2());
    expect(getFeatureFlag).toHaveBeenCalledWith(SEARCH_V2_FLAG);
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('enables v2 for a string variant value', () => {
    getFeatureFlag.mockReturnValue('test');
    const { result } = renderHook(() => useSearchV2());
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('falls back to v1 when the flag is boolean false', () => {
    getFeatureFlag.mockReturnValue(false);
    const { result } = renderHook(() => useSearchV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it("falls back to v1 for the string 'false' (the guard)", () => {
    getFeatureFlag.mockReturnValue('false');
    const { result } = renderHook(() => useSearchV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it('holds resolving, then enables once PostHog loads the flag', () => {
    getFeatureFlag.mockReturnValue(undefined);
    const { result } = renderHook(() => useSearchV2());
    expect(result.current).toEqual({ enabled: false, resolving: true });

    getFeatureFlag.mockReturnValue(true);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('falls back to v1 when the flag never resolves', () => {
    getFeatureFlag.mockReturnValue(undefined);
    const { result } = renderHook(() => useSearchV2());
    expect(result.current.resolving).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });
});
