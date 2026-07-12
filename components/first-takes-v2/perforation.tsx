/**
 * Perforation — the flat dotted separator between ledger rows (contract note B).
 *
 * Deliberately cheap: a measured row of small dots (plain Views), NOT a per-row
 * SVG mount. The stub silhouette is reserved for the hero; the diary rows stay
 * light so a long list doesn't pay a Path-per-row cost.
 */

import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '@/lib/theme-context';

const DOT = 2.2;
const PITCH = 9; // matches the mock's 9px perforation pitch

export function Perforation() {
  const { effectiveTheme } = useTheme();
  const [width, setWidth] = useState(0);

  const dotColor = effectiveTheme === 'dark' ? '#3a3a41' : '#c9c9cf';
  const count = width > 0 ? Math.floor(width / PITCH) : 0;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.wrap} onLayout={onLayout} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: dotColor }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 2,
    marginHorizontal: 2,
    overflow: 'hidden',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginRight: PITCH - DOT,
  },
});
