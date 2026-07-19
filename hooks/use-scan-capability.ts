import { requireOptionalNativeModule } from 'expo-modules-core';

// CAPABILITY GATE (not a flag): Ticket Scan's live-camera flow needs the
// ExpoCamera NATIVE module, which only exists in binaries built >= 1.5.1. On
// older binaries (iOS 1.5.0 b32) merely evaluating `expo-camera` throws
// "Cannot find native module 'ExpoCamera'" and crashes the Scan tab — burned
// 2026-07-07 on two real devices. requireOptionalNativeModule returns null
// instead of throwing, so this is safe to probe at module scope. When the
// module is absent, callers must fall back to the legacy button-focused
// scanner/journey screens — this check survived the `ticket_scan_v2` flag
// strip (2026-07-18, issue #659) because it guards a device capability, not
// a rollout percentage.
let hasCameraCache: boolean | null = null;
export function hasExpoCameraModule(): boolean {
  if (hasCameraCache === null) {
    try {
      hasCameraCache = requireOptionalNativeModule('ExpoCamera') != null;
    } catch {
      hasCameraCache = false;
    }
  }
  return hasCameraCache;
}
/** Test-only: clears the memoized native-module probe. */
export function __resetExpoCameraProbeForTests(): void {
  hasCameraCache = null;
}
