/**
 * Capability-gate regression tests for useTicketScanV2 (2026-07-07).
 *
 * On binaries WITHOUT the ExpoCamera native module (iOS 1.5.0 b32), the hook
 * must resolve v1 regardless of the PostHog flag or the env override —
 * otherwise scanner.tsx attempts a v2 render, the lazy scan-v2-flow chunk
 * evaluates `expo-camera`, and requireNativeModule('ExpoCamera') crashes the
 * Scan tab. These tests pin the "module absent → always v1" contract.
 */
import { renderHook } from '@testing-library/react-native';
import {
  useTicketScanV2,
  __resetExpoCameraProbeForTests,
} from '@/hooks/use-ticket-scan-v2';
import { analytics } from '@/lib/analytics';

let mockCameraPresent = true;
let mockCameraThrows = false;

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(() => {
    if (mockCameraThrows) throw new Error('boom');
    return mockCameraPresent ? {} : null;
  }),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: jest.fn() },
}));

const mockGetFlag = analytics.getFeatureFlag as jest.Mock;

function renderScenario(opts: {
  cameraPresent?: boolean;
  cameraThrows?: boolean;
  flag?: unknown;
}) {
  mockCameraPresent = opts.cameraPresent ?? true;
  mockCameraThrows = opts.cameraThrows ?? false;
  mockGetFlag.mockReturnValue(opts.flag);
  __resetExpoCameraProbeForTests();
  const { result, unmount } = renderHook(() => useTicketScanV2());
  const current = result.current as { variant: 'v1' | 'v2'; resolving: boolean };
  unmount();
  return current;
}

afterEach(() => {
  mockGetFlag.mockReset();
  __resetExpoCameraProbeForTests();
});

describe('useTicketScanV2 — ExpoCamera capability gate', () => {
  it('module ABSENT + flag true → v1, not resolving (the 1.5.0 crash path)', () => {
    expect(renderScenario({ cameraPresent: false, flag: true })).toEqual({
      variant: 'v1',
      resolving: false,
    });
  });

  it('module ABSENT + flag undefined → v1 immediately, no resolving hold', () => {
    expect(renderScenario({ cameraPresent: false, flag: undefined })).toEqual({
      variant: 'v1',
      resolving: false,
    });
  });

  it('module PRESENT + flag true → v2 (gate does not over-block)', () => {
    expect(renderScenario({ cameraPresent: true, flag: true }).variant).toBe('v2');
  });

  it('module PRESENT + flag false → v1 (flag still gates normally)', () => {
    expect(renderScenario({ cameraPresent: true, flag: false }).variant).toBe('v1');
  });

  it('requireOptionalNativeModule THROWING is treated as absent → v1', () => {
    expect(renderScenario({ cameraThrows: true, flag: true })).toEqual({
      variant: 'v1',
      resolving: false,
    });
  });
});
