/**
 * HeroTake — the latest take as a full stub-back (contract note A, Treatment A).
 *
 * The quote is the hero: ~19px medium with an oversized rose opening quote mark;
 * the movie demotes to the fine-print footer. The rating stamp is the ONLY place
 * rose ink lands on a stamp (accent), and only here. Spoilers are redacted in
 * place (Decision 2) with the stamp still visible. Tap anywhere → detail.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { hapticImpact } from '@/lib/haptics';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { FirstTake } from '@/lib/database.types';
import { hasRating } from '@/lib/first-takes-v2-logic';
import { TornStub } from './torn-stub';
import { RatingStamp } from './rating-stamp';
import { TakeMeta } from './take-meta';
import { SpoilerRedaction } from './spoiler-redaction';

interface HeroTakeProps {
  take: FirstTake;
  onPress: () => void;
}

export function HeroTake({ take, onPress }: HeroTakeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const quote = (
    <View style={styles.quoteBlock}>
      <Text style={[styles.quoteMark, { color: colors.tint }]}>&ldquo;</Text>
      <Text style={[styles.quote, { color: colors.text }]}>{take.quote_text}</Text>
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        hapticImpact();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      accessibilityRole="button"
    >
      <TornStub>
        <View style={styles.freshRow}>
          <View style={styles.quoteWrap}>
            {take.is_spoiler ? <SpoilerRedaction>{quote}</SpoilerRedaction> : quote}
          </View>
          {hasRating(take) && (
            <RatingStamp rating={take.rating!} accent size={52} />
          )}
        </View>
        <TakeMeta take={take} divider />
      </TornStub>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  freshRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  quoteWrap: {
    flex: 1,
  },
  quoteBlock: {
    // quote mark stacks above the quote, like the back-of-stub scribble.
  },
  quoteMark: {
    fontSize: 40,
    lineHeight: 34,
    fontWeight: '700',
    marginBottom: 2,
  },
  quote: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});
