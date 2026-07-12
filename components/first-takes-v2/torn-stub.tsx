/**
 * TornStub — the hero card's die-cut silhouette (contract note B).
 *
 * The card's own top edge is torn off the roll: a single onLayout-measured SVG
 * Path fills the whole card shape (jagged top, rounded bottom corners) and the
 * content sits on top of it. This is the StubBadge technique from #656 — a
 * View's border/background paints OVER its children on both platforms, so a
 * border+overlay tear always shows a straight edge through the notches. Drawing
 * the silhouette as a FILLED path makes the tear the card's actual edge.
 *
 * A hairline rim stroke on the silhouette + a soft elevation shadow keep the
 * tear visible in the light palette (contract Decision 6), where a white card on
 * a near-white ground otherwise hides it.
 */

import { useState, type ReactNode } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

/** Bottom corner radius. */
const CORNER = BorderRadius.md;
/** Depth (px from the card top) of a shallow apex — the tooth tips near the top. */
const TEAR_SHALLOW = 2;

/**
 * Precomputed jitter so the tear looks hand-torn instead of machine-perforated
 * (Ty round 1: uniform triangles read as fake). Tooth WIDTHS vary ~8–18pt and
 * notch DEPTHS ~4–10pt; the tables are tiled across whatever width the card
 * measures. Constant on purpose — never Math.random/Date.now at render, or the
 * tear would reshuffle on every layout pass (shimmer) and differ per platform.
 * Coprime-ish lengths (13 vs 11) so widths and depths don't repeat in lockstep.
 */
const TOOTH_WIDTHS = [13, 9, 16, 11, 18, 8, 14, 10, 17, 12, 15, 9, 12];
const NOTCH_DEPTHS = [8, 5, 9.5, 6, 10, 4.5, 7, 5.5, 9, 6.5, 8.5];
const MAX_NOTCH = 10;
/** Content clearance below the deepest possible tear point. */
export const TORN_TOP_PADDING = MAX_NOTCH + 14;

/**
 * One closed path: a hand-torn top edge (left→right, alternating shallow apex /
 * jittered notch) with straight sides and rounded bottom corners. The left edge
 * starts in a notch and the final tooth is clamped to terminate exactly at the
 * right edge so the vertical side is clean. Deterministic for a given width —
 * exported so a unit test can assert it's stable + well-formed.
 */
export function buildTornStubPath(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '';

  const segs: string[] = [`M 0 ${NOTCH_DEPTHS[0]}`];
  let x = 0;
  let widthIdx = 0;
  let depthIdx = 1; // 0 used for the left-edge start
  let shallow = true; // first interior point rises to a shallow apex

  while (x < w) {
    let nx = x + TOOTH_WIDTHS[widthIdx % TOOTH_WIDTHS.length];
    widthIdx++;
    const ny = shallow ? TEAR_SHALLOW : NOTCH_DEPTHS[depthIdx++ % NOTCH_DEPTHS.length];
    if (nx >= w) nx = w; // clamp the last (partial) tooth to the right edge
    segs.push(`L ${round(nx)} ${round(ny)}`);
    x = nx;
    shallow = !shallow;
  }

  segs.push(`L ${round(w)} ${round(h - CORNER)}`);
  segs.push(`Q ${round(w)} ${round(h)} ${round(w - CORNER)} ${round(h)}`);
  segs.push(`L ${CORNER} ${round(h)}`);
  segs.push(`Q 0 ${round(h)} 0 ${round(h - CORNER)}`);
  segs.push('Z');
  return segs.join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

interface TornStubProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function TornStub({ children, style }: TornStubProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Subtle lighter rim on the torn edge so the silhouette reads against the
  // ground — critical in the light palette (white card / near-white ground).
  const rim = effectiveTheme === 'dark' ? '#303038' : '#b9b9c0';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) {
      setSize({ w: width, h: height });
    }
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.wrap,
        effectiveTheme === 'dark' ? styles.shadowDark : styles.shadowLight,
        { paddingTop: TORN_TOP_PADDING },
        style,
      ]}
    >
      {size && (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path
            d={buildTornStubPath(size.w, size.h)}
            fill={colors.card}
            stroke={rim}
            strokeWidth={1}
          />
        </Svg>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    // Rounded bottom only — the SVG owns the torn top. Clips nothing (content
    // stays inside padding); present so any child background reads correctly.
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  shadowDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  shadowLight: {
    ...Platform.select({
      ios: {
        shadowColor: '#18181b',
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
});
