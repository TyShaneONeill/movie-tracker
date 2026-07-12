/**
 * LedgerRow — an older take as a quiet ledger entry (contract note A/G).
 *
 * The diary after the hero: a 3-line quote clamp with a small neutral rating
 * stamp and the same fine-print footer, no stub silhouette. Rows are separated
 * by flat perforation dots (see Perforation) — NOT per-row SVG mounts, for perf.
 * Spoilers redact in place; the stamp stays visible. Tap anywhere → detail.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { hapticImpact } from '@/lib/haptics';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { FirstTake } from '@/lib/database.types';
import { hasRating } from '@/lib/first-takes-v2-logic';
import { RatingStamp } from './rating-stamp';
import { TakeMeta } from './take-meta';
import { SpoilerRedaction } from './spoiler-redaction';

interface LedgerRowProps {
  take: FirstTake;
  onPress: () => void;
}

export function LedgerRow({ take, onPress }: LedgerRowProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const quote = (
    <Text style={[styles.quote, { color: colors.text }]} numberOfLines={3}>
      <Text style={{ color: colors.textTertiary }}>&ldquo;</Text>
      {take.quote_text}
    </Text>
  );

  return (
    <Pressable
      onPress={() => {
        hapticImpact();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
    >
      <View style={styles.top}>
        <View style={styles.quoteWrap}>
          {take.is_spoiler ? <SpoilerRedaction>{quote}</SpoilerRedaction> : quote}
        </View>
        {hasRating(take) && <RatingStamp rating={take.rating!} size={40} />}
      </View>
      <TakeMeta take={take} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  quoteWrap: {
    flex: 1,
  },
  quote: {
    fontSize: 15,
    lineHeight: 22,
  },
});
