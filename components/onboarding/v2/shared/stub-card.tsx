import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

interface StubCardProps {
  top: ReactNode;
  bottom: ReactNode;
  /**
   * Fixed pixel height of the TOP section. Per the ticket-stub rule the
   * perforation is anchored a fixed distance from the top edge (NOT a
   * percentage). Design values: 360 (Welcome) / 230 (Success).
   */
  topHeight: number;
  /** Card corner radius (design: 22 Welcome / 20 Success). */
  radius?: number;
}

const STUB_BG = '#16161b';

/**
 * Perforated ticket-stub card: a top section of fixed height, a dashed tear
 * line with side notches, and a bottom stub. A shadow wrapper carries the rose
 * glow so the inner card can keep `overflow: hidden` for the notch cutouts.
 */
export function StubCard({ top, bottom, topHeight, radius = 22 }: StubCardProps) {
  const colors = Colors.dark;

  return (
    <View style={[styles.glow, { borderRadius: radius, backgroundColor: STUB_BG }]}>
      <View style={[styles.card, { borderRadius: radius, backgroundColor: STUB_BG, borderColor: colors.border }]}>
        <View style={{ height: topHeight }}>{top}</View>

        {/* Tear line + notches pinned to the fixed top offset */}
        <View style={styles.perforation}>
          <View style={[styles.notch, styles.notchLeft, { backgroundColor: colors.background }]} />
          <View style={styles.dashed} />
          <View style={[styles.notch, styles.notchRight, { backgroundColor: colors.background }]} />
        </View>

        <View style={styles.bottom}>{bottom}</View>
      </View>
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  glow: Platform.select({
    ios: {
      shadowColor: Colors.dark.tint,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.22,
      shadowRadius: 30,
    },
    android: { elevation: 12 },
    default: {},
  }) as object,
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  perforation: {
    height: 0,
    justifyContent: 'center',
  },
  dashed: {
    marginHorizontal: 16,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(255,255,255,0.16)',
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
