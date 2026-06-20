import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

interface StubCardProps {
  top: ReactNode;
  bottom: ReactNode;
  /** Fixed pixel height of the TOP section (used when topFlex is false). */
  topHeight?: number;
  /** When true the card fills its parent and the top half flexes, with the
   * perforation pinned just above a content-sized bottom stub (the tall
   * Welcome look). When false the top is a fixed `topHeight` (Success). */
  topFlex?: boolean;
  /** Card corner radius (design: 22 Welcome / 20 Success). */
  radius?: number;
}

const STUB_BG = '#16161b';
const DASH_COUNT = 42;

/**
 * Perforated ticket-stub card: a top section, a dashed tear line with side
 * notches that read as torn-out cutouts (filled with the screen bg), and a
 * bottom stub. Flat (no glow) so the notches blend into the page like the mock.
 */
export function StubCard({ top, bottom, topHeight = 230, topFlex = false, radius = 22 }: StubCardProps) {
  const colors = Colors.dark;

  return (
    <View
      style={[
        styles.card,
        topFlex && styles.cardFill,
        { borderRadius: radius, backgroundColor: STUB_BG },
      ]}
    >
      <View style={topFlex ? styles.topFlex : { height: topHeight }}>{top}</View>

      {/* Tear line: bg-colored side notches + a row of real dash segments
          (a single-side dashed border doesn't render on iOS). */}
      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: colors.background }]} />
        <View style={styles.dashRow} pointerEvents="none">
          {Array.from({ length: DASH_COUNT }).map((_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
        <View style={[styles.notch, styles.notchRight, { backgroundColor: colors.background }]} />
      </View>

      <View style={styles.bottom}>{bottom}</View>
    </View>
  );
}

const NOTCH = 20;

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    width: '100%',
  },
  cardFill: {
    flex: 1,
  },
  topFlex: {
    flex: 1,
  },
  perforation: {
    height: 0,
    justifyContent: 'center',
  },
  dashRow: {
    position: 'absolute',
    left: NOTCH / 2 + 4,
    right: NOTCH / 2 + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dash: {
    width: 4,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    top: -NOTCH / 2,
  },
  notchLeft: {
    left: -NOTCH / 2,
  },
  notchRight: {
    right: -NOTCH / 2,
  },
  bottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
});
