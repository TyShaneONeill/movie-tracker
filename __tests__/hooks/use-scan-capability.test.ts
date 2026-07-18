/**
 * Capability-gate regression tests for hasExpoCameraModule (2026-07-07).
 *
 * On binaries WITHOUT the ExpoCamera native module (iOS 1.5.0 b32), the probe
 * must report absent so scanner.tsx and the journey screen fall back to their
 * v1 UIs — otherwise a v2 render is attempted, the lazy scan-v2-flow chunk
 * evaluates `expo-camera`, and requireNativeModule('ExpoCamera') crashes the
 * Scan tab. These tests pin the "module absent → hasExpoCameraModule() is
 * false" contract; they no longer cover the `ticket_scan_v2` PostHog flag,
 * which was stripped 2026-07-18 (issue #659) — this is a device capability
 * check, not a rollout.
 */
import {
  hasExpoCameraModule,
  __resetExpoCameraProbeForTests,
} from '@/hooks/use-scan-capability';

let mockCameraPresent = true;
let mockCameraThrows = false;

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(() => {
    if (mockCameraThrows) throw new Error('boom');
    return mockCameraPresent ? {} : null;
  }),
}));

function probe(opts: { cameraPresent?: boolean; cameraThrows?: boolean }) {
  mockCameraPresent = opts.cameraPresent ?? true;
  mockCameraThrows = opts.cameraThrows ?? false;
  __resetExpoCameraProbeForTests();
  return hasExpoCameraModule();
}

afterEach(() => {
  __resetExpoCameraProbeForTests();
});

describe('hasExpoCameraModule — ExpoCamera capability gate', () => {
  it('module ABSENT → false (the 1.5.0 crash path)', () => {
    expect(probe({ cameraPresent: false })).toBe(false);
  });

  it('module PRESENT → true', () => {
    expect(probe({ cameraPresent: true })).toBe(true);
  });

  it('requireOptionalNativeModule THROWING is treated as absent → false', () => {
    expect(probe({ cameraThrows: true })).toBe(false);
  });

  it('memoizes the probe result across calls until reset', () => {
    mockCameraThrows = false;
    mockCameraPresent = true;
    __resetExpoCameraProbeForTests();
    expect(hasExpoCameraModule()).toBe(true);

    // Flip the underlying mock without resetting — the cached value should stick.
    mockCameraPresent = false;
    expect(hasExpoCameraModule()).toBe(true);
  });
});
