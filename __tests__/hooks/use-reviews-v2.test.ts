import { renderHook } from '@testing-library/react-native';
import { useReviewsV2, REVIEWS_V2_FLAG } from '@/hooks/use-reviews-v2';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: jest.fn() },
}));

const getFeatureFlag = analytics.getFeatureFlag as jest.Mock;

describe('useReviewsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enables v2 when the flag is true', () => {
    getFeatureFlag.mockReturnValue(true);
    const { result } = renderHook(() => useReviewsV2());
    expect(getFeatureFlag).toHaveBeenCalledWith(REVIEWS_V2_FLAG);
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('enables v2 for a string variant value', () => {
    getFeatureFlag.mockReturnValue('test');
    const { result } = renderHook(() => useReviewsV2());
    expect(result.current).toEqual({ enabled: true, resolving: false });
  });

  it('falls back to legacy when the flag is disabled', () => {
    getFeatureFlag.mockReturnValue(false);
    const { result } = renderHook(() => useReviewsV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it("falls back to legacy for the string 'false'", () => {
    getFeatureFlag.mockReturnValue('false');
    const { result } = renderHook(() => useReviewsV2());
    expect(result.current).toEqual({ enabled: false, resolving: false });
  });

  it('fails CLOSED while the flag is unresolved (undefined): resolving, not enabled', () => {
    getFeatureFlag.mockReturnValue(undefined);
    const { result } = renderHook(() => useReviewsV2());
    expect(result.current.enabled).toBe(false);
    expect(result.current.resolving).toBe(true);
  });
});
