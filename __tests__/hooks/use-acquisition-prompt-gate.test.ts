import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAcquisitionPromptGate } from '@/hooks/use-feature-flag';
import { analytics } from '@/lib/analytics';

// Mock analytics so the gate reads a controllable flag value and a
// controllable onFeatureFlags subscription.
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: jest.fn(),
    reloadFeatureFlags: jest.fn(),
    onFeatureFlags: jest.fn(() => () => {}),
  },
}));

const getFeatureFlagMock = analytics.getFeatureFlag as jest.Mock;
const onFeatureFlagsMock = analytics.onFeatureFlags as jest.Mock;
const ORIGINAL_OVERRIDE = process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE;

/** Captures the callback PostHog would invoke once flags land. */
function captureFlagsCallback(): () => void {
  let callback = () => {};
  onFeatureFlagsMock.mockImplementation((cb: () => void) => {
    callback = cb;
    return () => {};
  });
  return () => callback();
}

beforeEach(() => {
  jest.clearAllMocks();
  onFeatureFlagsMock.mockReturnValue(() => {});
  delete process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE;
});

afterAll(() => {
  if (ORIGINAL_OVERRIDE === undefined) {
    delete process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE;
  } else {
    process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE = ORIGINAL_OVERRIDE;
  }
});

describe('useAcquisitionPromptGate — resolution', () => {
  it('an already-cached flag is resolved on the first render', () => {
    getFeatureFlagMock.mockReturnValue(true);
    const { result } = renderHook(() => useAcquisitionPromptGate());
    expect(result.current).toEqual({ enabled: true, resolved: true });
  });

  it('an unresolved flag reports NOT resolved — never a bare false', () => {
    getFeatureFlagMock.mockReturnValue(undefined);
    const { result } = renderHook(() => useAcquisitionPromptGate());
    // The whole point of the gate: `enabled: false` here means "unknown", and
    // `resolved: false` is what lets the caller wait instead of giving up.
    expect(result.current).toEqual({ enabled: false, resolved: false });
  });

  it('flags landing LATE flip the gate to enabled+resolved', async () => {
    getFeatureFlagMock.mockReturnValue(undefined);
    const fireFlagsLoaded = captureFlagsCallback();

    const { result } = renderHook(() => useAcquisitionPromptGate());
    expect(result.current.resolved).toBe(false);

    getFeatureFlagMock.mockReturnValue(true);
    act(() => fireFlagsLoaded());

    await waitFor(() => expect(result.current).toEqual({ enabled: true, resolved: true }));
  });

  it('flags that NEVER land resolve via the backstop and fail closed', async () => {
    jest.useFakeTimers();
    try {
      getFeatureFlagMock.mockReturnValue(undefined);
      const { result } = renderHook(() => useAcquisitionPromptGate(5000));
      expect(result.current.resolved).toBe(false);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current).toEqual({ enabled: false, resolved: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves immediately when flags land between render and subscribe', () => {
    // Unresolved for the initial render's reads, resolved by the time the
    // effect re-checks — the race the gate guards explicitly. onFeatureFlags
    // has already fired by then, so only that re-check can save this launch.
    getFeatureFlagMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValue(true);
    const { result } = renderHook(() => useAcquisitionPromptGate());
    expect(result.current).toEqual({ enabled: true, resolved: true });
  });

  it('env override "true" is resolved without waiting on PostHog', () => {
    process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE = 'true';
    getFeatureFlagMock.mockReturnValue(undefined);
    const { result } = renderHook(() => useAcquisitionPromptGate());
    expect(result.current).toEqual({ enabled: true, resolved: true });
    expect(onFeatureFlagsMock).not.toHaveBeenCalled();
  });

  it('env override "false" forces disabled even when the flag is on', () => {
    process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE = 'false';
    getFeatureFlagMock.mockReturnValue(true);
    const { result } = renderHook(() => useAcquisitionPromptGate());
    expect(result.current).toEqual({ enabled: false, resolved: true });
  });
});
