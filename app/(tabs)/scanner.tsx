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

import { View } from 'react-native';

import { ScannerV1 } from '@/components/scanner/scanner-v1';
import { ScanV2Flow } from '@/components/scan-v2/scan-v2-flow';
import { useScanColors } from '@/constants/scan-v2-theme';
import { useTicketScanV2 } from '@/hooks/use-ticket-scan-v2';

export default function ScannerScreen() {
  const { variant, resolving } = useTicketScanV2();
  const c = useScanColors();

  if (resolving) {
    return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  }

  if (variant === 'v2') {
    return <ScanV2Flow />;
  }

  return <ScannerV1 />;
}
