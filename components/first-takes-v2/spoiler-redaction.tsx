/**
 * SpoilerRedaction — tap-to-reveal-in-place for spoiler-marked takes
 * (contract note E / Decision 2). Redacted EVERYWHERE, including the owner's own
 * profile, for consistency (this also closes the live profile-tab spoiler leak
 * that the legacy card had). The rating stamp stays visible alongside — a rating
 * is not a spoiler.
 *
 * Renders the redaction chip until tapped, then swaps the real quote in place.
 * The chip is its own Pressable so tapping it reveals WITHOUT triggering the
 * card's navigation to the detail screen (the inner press captures the touch).
 */

import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface SpoilerRedactionProps {
  /** The real quote element, shown only after reveal. */
  children: ReactNode;
}

export function SpoilerRedaction({ children }: SpoilerRedactionProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  return (
    <Pressable
      onPress={() => setRevealed(true)}
      accessibilityRole="button"
      accessibilityLabel="Spoiler, tap to reveal"
      style={({ pressed }) => [
        styles.redact,
        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.bar} aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={[styles.barSeg, { backgroundColor: i % 2 === 0 ? colors.textTertiary : colors.border }]}
          />
        ))}
      </View>
      <Text style={[styles.lbl, { color: colors.textSecondary }]}>SPOILER · TAP TO REVEAL</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  redact: {
    alignSelf: 'flex-start',
    // On the hero the chip shares a flex row with the rating stamp; capping it to
    // its parent column (the quote slot) means it can never overflow under the
    // stamp at any label length or screen width (Ty round 1: overlap at ~320pt).
    // The label shrinks/wraps within instead of pushing the chip wider.
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bar: {
    flexDirection: 'row',
    width: 120,
    maxWidth: 120,
    flexShrink: 1,
    height: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barSeg: {
    flex: 1,
  },
  lbl: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '700',
    flexShrink: 1,
  },
});
