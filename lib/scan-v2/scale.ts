import { PixelRatio } from 'react-native';

/**
 * OS-text-scale multiplier for Ticket Scan v2 layouts.
 *
 * Every numeric size in the v2 scan flow is authored at the base (Medium / 1.0)
 * scale and run through `s()` so the screens reflow at small (≈0.9×) and large
 * (≈1.18×) OS font sizes — mirroring the design prototype's `s(px)` helper.
 *
 * Because `s()` is the SOLE source of text scaling for v2, every `<Text>` in the
 * flow disables RN's own font scaling (`allowFontScaling={false}`, via the
 * `ScanText` wrapper) to avoid double-scaling.
 *
 * `PixelRatio.getFontScale()` is read at call time, so layouts pick up the
 * device's current Dynamic Type / Android font scale on render.
 */
export function s(px: number): number {
  const fontScale = PixelRatio.getFontScale();
  const clamped = Math.min(1.18, Math.max(0.9, fontScale));
  return px * clamped;
}
