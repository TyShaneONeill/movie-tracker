import { renderHook } from '@testing-library/react-native';
import { usePostImportUpsellEnabled } from '@/hooks/use-feature-flag';
import { analytics } from '@/lib/analytics';

// Mock analytics so useFeatureFlag reads a controllable flag value.
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: jest.fn(),
    reloadFeatureFlags: jest.fn(),
  },
}));

const getFeatureFlagMock = analytics.getFeatureFlag as jest.Mock;
const ORIGINAL_OVERRIDE = process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE;
});

afterAll(() => {
  if (ORIGINAL_OVERRIDE === undefined) {
    delete process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE;
  } else {
    process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE = ORIGINAL_OVERRIDE;
  }
});

describe('usePostImportUpsellEnabled — flag/env gate', () => {
  it('is enabled when the PostHog flag is on and no override is set', () => {
    getFeatureFlagMock.mockReturnValue(true);
    const { result } = renderHook(() => usePostImportUpsellEnabled());
    expect(result.current).toBe(true);
  });

  it('fails closed when the flag is still loading (undefined)', () => {
    getFeatureFlagMock.mockReturnValue(undefined);
    const { result } = renderHook(() => usePostImportUpsellEnabled());
    expect(result.current).toBe(false);
  });

  it('fails closed when the flag is off', () => {
    getFeatureFlagMock.mockReturnValue(false);
    const { result } = renderHook(() => usePostImportUpsellEnabled());
    expect(result.current).toBe(false);
  });

  it('env override "true" forces enabled even when the flag is off', () => {
    process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE = 'true';
    getFeatureFlagMock.mockReturnValue(false);
    const { result } = renderHook(() => usePostImportUpsellEnabled());
    expect(result.current).toBe(true);
  });

  it('env override "false" forces disabled even when the flag is on', () => {
    process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE = 'false';
    getFeatureFlagMock.mockReturnValue(true);
    const { result } = renderHook(() => usePostImportUpsellEnabled());
    expect(result.current).toBe(false);
  });
});
