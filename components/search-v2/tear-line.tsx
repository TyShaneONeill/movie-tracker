/**
 * TearLine — the perforated separator between the "asking" zone (field + chips)
 * and the "finding" zone (results) in Search v2 (Proposal 01.2). The stub motif
 * as structure, used once per screen.
 *
 * Built from plain Views: a dashed hairline drawn as a row of short segments
 * (RN can't render a single-side dashed border on iOS — it is a no-op there),
 * with a row of screen-background-filled circles punched over it so the line
 * reads as perforated.
 */

import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

const HOLE = 8;
const HOLE_PERIOD = 16; // matches the mock's 16px perforation pitch
const DASH = 5;
const DASH_GAP = 4;

export function TearLine() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const holeCount = width > 0 ? Math.ceil(width / HOLE_PERIOD) + 1 : 0;
  const dashCount = width > 0 ? Math.ceil(width / (DASH + DASH_GAP)) + 1 : 0;

  return (
    <View style={styles.tear} onLayout={onLayout}>
      <View style={styles.dashRow} pointerEvents="none">
        {Array.from({ length: dashCount }).map((_, i) => (
          <View
            key={`d${i}`}
            style={[styles.dash, { backgroundColor: colors.border }]}
          />
        ))}
      </View>
      <View style={styles.holeRow} pointerEvents="none">
        {Array.from({ length: holeCount }).map((_, i) => (
          <View
            key={`h${i}`}
            style={[styles.hole, { backgroundColor: colors.background }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tear: {
    height: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dashRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dash: {
    width: DASH,
    height: 1,
    marginRight: DASH_GAP,
  },
  holeRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hole: {
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    marginRight: HOLE_PERIOD - HOLE,
  },
});
