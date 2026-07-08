/**
 * Scanner tab entry — Ticket Scan v1/v2 gate.
 *
 * Resolves the `ticket_scan_v2` PostHog flag (env-override short-circuit) and
 * branches:
 *   - v2 (beta testers) -> the redesigned live-camera capture flow (`ScanV2Flow`).
 *   - v1 (everyone else / default) -> the existing button-focused scanner.
 *
 * While the flag is still resolving we render a neutral dark screen to avoid
 * flashing v1 and snapping to v2 for a tester. With the flag OFF the v1 scanner
 * (and its `/scan/*` routes) render byte-for-byte unchanged.
 */

import React, { Suspense } from 'react';
import { View } from 'react-native';

import { ScannerV1 } from '@/components/scanner/scanner-v1';
import { useScanColors } from '@/constants/scan-v2-theme';
import { useTicketScanV2 } from '@/hooks/use-ticket-scan-v2';

// LAZY on purpose: statically importing scan-v2-flow evaluates `expo-camera`,
// whose module scope calls requireNativeModule('ExpoCamera') — an immediate
// throw on binaries without the pod (iOS 1.5.0 b32), crashing the Scan tab at
// route load BEFORE any flag check can run. React.lazy defers that evaluation
// until a v2 render is actually attempted, which useTicketScanV2 only permits
// when the native module exists (HAS_EXPO_CAMERA). Burned 2026-07-07.
const ScanV2Flow = React.lazy(() =>
  import('@/components/scan-v2/scan-v2-flow').then((m) => ({ default: m.ScanV2Flow }))
);

export default function ScannerScreen() {
  const { variant, resolving } = useTicketScanV2();
  const c = useScanColors();

  if (resolving) {
    return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  }

  if (variant === 'v2') {
    return (
      <Suspense fallback={<View style={{ flex: 1, backgroundColor: c.bg }} />}>
        <ScanV2Flow />
      </Suspense>
    );
  }

  return <ScannerV1 />;
}
