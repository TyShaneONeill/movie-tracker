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
/** Torn top edge oscillates between these depths (px from the card top). */
const TEAR_SHALLOW = 2;
const TEAR_DEEP = 9;
/** Content clearance below the deepest tear point. */
export const TORN_TOP_PADDING = TEAR_DEEP + 15;

/**
 * One closed path: a jagged top edge (left→right, alternating shallow/deep) with
 * straight sides and rounded bottom corners. Both top corners sit at the deep
 * depth so the vertical sides start cleanly. Exported for unit testing the
 * geometry is a closed, well-formed path.
 */
export function buildTornStubPath(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '';
  const teeth = Math.max(14, Math.round(w / 14));
  const n = teeth % 2 === 0 ? teeth : teeth + 1; // even → both ends land "deep"

  const segs: string[] = [`M 0 ${TEAR_DEEP}`];
  for (let i = 1; i <= n; i++) {
    const x = (w * i) / n;
    const y = i % 2 === 0 ? TEAR_DEEP : TEAR_SHALLOW;
    segs.push(`L ${round(x)} ${y}`);
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
