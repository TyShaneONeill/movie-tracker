/**
 * Scanner tab entry.
 *
 * Renders the redesigned live-camera capture flow (`ScanV2Flow`) by default.
 * Formerly gated behind the `ticket_scan_v2` PostHog flag; stripped
 * 2026-07-18 after 100% rollout since 2026-07-05 (issue #659).
 *
 * The ExpoCamera CAPABILITY check is NOT part of that flag and is preserved:
 * on binaries without the native module (pre-1.5.1), `hasExpoCameraModule()`
 * is false and the legacy button-focused `ScannerV1` renders instead — this
 * guards a device capability, not a rollout, so it stays regardless of the
 * flag strip.
 */

import React, { Suspense } from 'react';
import { View } from 'react-native';

import { ScannerV1 } from '@/components/scanner/scanner-v1';
import { useScanColors } from '@/constants/scan-v2-theme';
import { hasExpoCameraModule } from '@/hooks/use-scan-capability';

// LAZY on purpose: statically importing scan-v2-flow evaluates `expo-camera`,
// whose module scope calls requireNativeModule('ExpoCamera') — an immediate
// throw on binaries without the pod (iOS 1.5.0 b32), crashing the Scan tab at
// route load BEFORE the capability check below can run. React.lazy defers
// that evaluation until a v2 render is actually attempted, which only
// happens when hasExpoCameraModule() is true. Burned 2026-07-07.
const ScanV2Flow = React.lazy(() =>
  import('@/components/scan-v2/scan-v2-flow').then((m) => ({ default: m.ScanV2Flow }))
);

export default function ScannerScreen() {
  const c = useScanColors();

  if (!hasExpoCameraModule()) {
    return <ScannerV1 />;
  }

  return (
    <Suspense fallback={<View style={{ flex: 1, backgroundColor: c.bg }} />}>
      <ScanV2Flow />
    </Suspense>
  );
}
