import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

import { Colors, BorderRadius, Spacing } from '@/constants/theme';

interface StubCardProps {
  top: ReactNode;
  bottom: ReactNode;
  /**
   * Fixed pixel height of the TOP section. Per the ticket-stub rule, the
   * perforation is anchored a fixed distance from the top edge (NOT a
   * percentage) so the tear line never slides into the content as the card
   * grows. PR2 will tune these offsets to the design's 360 / 230 values.
   */
  topHeight: number;
}

/**
 * Perforated ticket-stub card: a top section of fixed height, a dashed tear
 * line with side notches, and a bottom stub. Always dark.
 */
export function StubCard({ top, bottom, topHeight }: StubCardProps) {
  const colors = Colors.dark;

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
      <View style={{ height: topHeight }}>{top}</View>

      {/* Tear line + notches pinned to the fixed top offset */}
      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: colors.background }]} />
        <View style={[styles.dashed, { borderTopColor: colors.border }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: colors.background }]} />
      </View>

      <View style={styles.bottom}>{bottom}</View>
    </View>
  );
}

const NOTCH = 20;

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  perforation: {
    height: 0,
    justifyContent: 'center',
  },
  dashed: {
    marginHorizontal: NOTCH / 2,
    borderTopWidth: 2,
    borderStyle: 'dashed',
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
    padding: Spacing.lg,
  },
});
