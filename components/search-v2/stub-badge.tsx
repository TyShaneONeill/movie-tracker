/**
 * StubBadge — the signature type tag for Search v2 (Proposal 01.2).
 *
 * A bordered, uppercase, letter-spaced tag (MOVIE / TV / PERSON) shaped like a
 * ticket stub: semicircular notches die-cut into BOTH side edges at mid-height.
 *
 * The outline is a single SVG path (measured via onLayout) — earlier attempts
 * with border + overlaid circles failed because a View's border paints ON TOP
 * of its children on both platforms, so the straight border always showed
 * through the notch mouth (Ty device rounds 1-3). With the path, the border
 * genuinely curves around the notches: a true cutout.
 *
 * `highlighted` (rose outline + ink text) is reserved for the non-default type
 * in context — e.g. TV rows shown while the Movies scope is active in the
 * rescue state. Accent as information, never decoration.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface StubBadgeProps {
  label: string;
  highlighted?: boolean;
}

/** Notch radius (the die-cut half circles). */
const NOTCH = 4;
/** Corner radius of the stub. */
const CORNER = 3;

/**
 * One closed path: rounded rect with an inward semicircular notch centered on
 * each side edge. Clockwise from the top-left corner; the notch arcs bulge
 * INTO the badge (sweep flags chosen so the arc midpoint sits inside). Edges
 * inset by 0.5 so the 1px stroke isn't clipped by the SVG viewport.
 */
function stubPath(w: number, h: number): string {
  const cy = h / 2;
  return [
    `M ${CORNER} 0.5`,
    `H ${w - CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${w - 0.5} ${CORNER}`,
    `V ${cy - NOTCH}`,
    // right notch: down the chord, arc passing through (w - NOTCH, cy)
    `A ${NOTCH} ${NOTCH} 0 0 0 ${w - 0.5} ${cy + NOTCH}`,
    `V ${h - CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${w - CORNER} ${h - 0.5}`,
    `H ${CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 0.5 ${h - CORNER}`,
    `V ${cy + NOTCH}`,
    // left notch: up the chord, arc passing through (NOTCH, cy)
    `A ${NOTCH} ${NOTCH} 0 0 0 0.5 ${cy - NOTCH}`,
    `V ${CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${CORNER} 0.5`,
    'Z',
  ].join(' ');
}

export function StubBadge({ label, highlighted = false }: StubBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const borderColor = highlighted ? colors.tint : colors.border;
  const textColor = highlighted ? colors.text : colors.textSecondary;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) {
      setSize({ w: width, h: height });
    }
  };

  return (
    <View style={styles.badge} onLayout={onLayout}>
      {size && (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path d={stubPath(size.w, size.h)} stroke={borderColor} strokeWidth={1} fill="none" />
        </Svg>
      )}
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
});
