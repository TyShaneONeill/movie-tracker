/**
 * GenreStub — a ticket-stub tile in the Search v2 browse rack (Proposal 01.2).
 *
 * A 2-column-grid tile shaped like a torn ticket: a perforated left edge column
 * carrying vertical "ADMIT ONE" microtype, the genre/shelf name, and beneath it
 * an archival serial (Nº 878 for genres, "Curated" for studio shelves). A punch
 * hole — the mark the usher's clipper leaves — sits centered on the right edge,
 * filled with the screen background so it reads as a real hole.
 *
 * The perforated divider is drawn as a column of short segments (RN renders a
 * single-side dashed border as a no-op on iOS), echoing the TearLine motif.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface GenreStubProps {
  name: string;
  /** Archival serial line, e.g. "Nº 878" or "Curated". */
  serial: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Fixed tile width, set by the 2-column grid. */
  width: number;
}

const STUB_HEIGHT = 70;
const PUNCH = 9;
// Fixed height → fixed perforation count (segment 3px + 3px gap ≈ 6px pitch).
const PERF_SEGMENTS = Math.floor((STUB_HEIGHT - 12) / 6);

export function GenreStub({ name, serial, onPress, accessibilityLabel, width }: GenreStubProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.stub,
        { width, backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.edge}>
        <Text style={[styles.admit, { color: colors.textTertiary }]} numberOfLines={1}>
          ADMIT ONE
        </Text>
      </View>

      <View style={styles.perf} pointerEvents="none">
        {Array.from({ length: PERF_SEGMENTS }).map((_, i) => (
          <View key={i} style={[styles.perfDash, { backgroundColor: colors.border }]} />
        ))}
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.serial, { color: colors.textTertiary }]} numberOfLines={1}>
          {serial}
        </Text>
      </View>

      <View style={[styles.punch, { backgroundColor: colors.background, borderColor: colors.border }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stub: {
    flexDirection: 'row',
    height: STUB_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  edge: {
    width: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  admit: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    // Rotate the horizontal label to run vertically along the perforated edge.
    transform: [{ rotate: '-90deg' }],
    width: STUB_HEIGHT,
    textAlign: 'center',
  },
  perf: {
    width: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfDash: {
    width: 1,
    height: 3,
    marginBottom: 3,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingRight: 26, // leave room for the punch hole
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  serial: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  punch: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -PUNCH / 2,
    width: PUNCH,
    height: PUNCH,
    borderRadius: PUNCH / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
