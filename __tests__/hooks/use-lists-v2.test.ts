import { renderHook, act } from '@testing-library/react-native';
import { useListsV2, LISTS_V2_FLAG } from '@/hooks/use-lists-v2';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: jest.fn() },
}));

const getFeatureFlag = analytics.getFeatureFlag as jest.Mock;

describe('useListsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enables v2 when the flag is true', () => {
    getFeatureFlag.mockReturnValue(true);
    const { result } = renderHook(() => useListsV2());
    expect(getFeatureFlag).toHaveBeenCalledWith(LISTS_V2_FLAG);
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('enables v2 for a string variant value', () => {
    getFeatureFlag.mockReturnValue('test');
    const { result } = renderHook(() => useListsV2());
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('falls back to legacy when the flag is disabled', () => {
    getFeatureFlag.mockReturnValue(false);
    const { result } = renderHook(() => useListsV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it("falls back to legacy for the string 'false'", () => {
    getFeatureFlag.mockReturnValue('false');
    const { result } = renderHook(() => useListsV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it('fails closed while resolving, then enables once PostHog loads the flag', () => {
    getFeatureFlag.mockReturnValue(undefined);
    const { result } = renderHook(() => useListsV2());
    expect(result.current).toEqual({ enabled: false, resolving: true });

    getFeatureFlag.mockReturnValue(true);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('falls back to legacy when the flag never resolves', () => {
    getFeatureFlag.mockReturnValue(undefined);
    const { result } = renderHook(() => useListsV2());
    expect(result.current.resolving).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });
});
