/**
 * One card in the blank-stubs rating deck (founder soak round 4). The card wears
 * the faintest look of the movie poster as its full background — a heavy dim
 * overlay (~88% toward the card colour) keeps every label fully readable in both
 * themes, with the ticket perforation kept.
 *
 * Rating uses the app's canonical 1–10 slider (the SAME RatingSlider as
 * review-modal). Stars start UNSET ("—") — the deck ASKS, it never shows a
 * pre-filled score. Because a horizontal slider can't coexist with a horizontal
 * swipe-to-skip gesture, decisions are explicit buttons: SKIP and RATE (RATE
 * enables once the slider is touched). Keyed by item in the parent, so each card
 * mounts fresh — no rating leaks between cards (#662).
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { RatingSlider } from '@/components/ui/rating-slider';
import { hapticSelection } from '@/lib/haptics';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

interface DeckCardProps {
  item: DeckItem;
  reduced: boolean;
  disabled: boolean;
  onRate: (item: DeckItem, rating: number) => void;
  onSkip: (item: DeckItem) => void;
}

export function DeckCard({ item, reduced, disabled, onRate, onSkip }: DeckCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);

  const [rating, setRating] = useState<number>(5);
  const [touched, setTouched] = useState(false);

  // Subtle entrance so a new card reads as "next in the deck" (respects Reduce Motion).
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    enter.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [enter, reduced]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.96 + enter.value * 0.04 }, { translateY: (1 - enter.value) * 16 }],
  }));

  // w342 (the app's ceiling) — the poster is invisible at 88% dim, so a lighter fetch.
  const posterUrl = getTMDBImageUrl(item.posterPath, 'w342');

  // ANY interaction sets the rating and enables Rate — including a tap that lands
  // exactly on the resting value (5.0), where onValueChange never fires but
  // onSlidingComplete does. Both paths route through here.
  const markRated = (v: number) => {
    if (disabled) return;
    if (!touched) {
      setTouched(true);
      hapticSelection();
    }
    setRating(v);
  };

  return (
    <Animated.View style={[styles.card, enterStyle]}>
      {/* Faint poster background + heavy dim overlay (readability in both themes). */}
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />

      <View style={styles.content}>
        <View>
          <Text style={styles.film} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.meta}>
            {item.year ? `${item.year} · ` : ''}watched via TV Time import
          </Text>
        </View>

        <View style={styles.perforation}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={styles.perfDot} />
          ))}
        </View>

        <View style={styles.ratingBlock}>
          <Text style={styles.ratingLabel}>{touched ? 'YOUR RATING' : 'YOUR RATING — NOT SET'}</Text>
          <RatingSlider
            value={rating}
            onChange={markRated}
            onSlidingComplete={markRated}
            unset={!touched}
            disabled={disabled}
            valueFontSize={40}
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => !disabled && onSkip(item)}
            style={({ pressed }) => [styles.skipBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${item.title}`}
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </Pressable>
          <Pressable
            onPress={() => touched && !disabled && onRate(item, rating)}
            disabled={!touched || disabled}
            style={({ pressed }) => [
              styles.rateBtn,
              { backgroundColor: touched ? colors.tint : colors.backgroundSecondary },
              pressed && touched && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={touched ? `Rate ${item.title}` : 'Drag the slider to rate'}
          >
            <Text style={[styles.rateText, { color: touched ? '#fff' : colors.textTertiary }]}>
              {touched ? 'Rate' : 'Drag to rate'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      width: '88%',
      // Web: this swipe-card is a mobile design — cap it so `88%` doesn't resolve
      // against the full desktop viewport (~1290px at 1440). 440 keeps the
      // mobile card proportions; native is untouched. Centered via alignSelf.
      ...(Platform.OS === 'web' ? { maxWidth: 440 } : {}),
      alignSelf: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.4,
      shadowRadius: 30,
      elevation: 12,
    },
    // ~88% toward the card colour so the poster is only a faint texture and all
    // text stays fully legible in light and dark.
    dim: { backgroundColor: colors.card, opacity: 0.88 },
    content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
    film: { ...Typography.display.h3, color: colors.text, textTransform: 'uppercase' },
    meta: { ...Typography.body.sm, color: colors.textSecondary, marginTop: 6 },
    perforation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    perfDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
    ratingBlock: { alignItems: 'center', gap: Spacing.xs },
    ratingLabel: {
      ...Typography.body.xs,
      fontFamily: Fonts.inter.semibold,
      letterSpacing: 1.5,
      color: colors.textSecondary,
    },
    footer: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
    skipBtn: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    skipText: { ...Typography.body.base, fontFamily: Fonts.inter.semibold },
    // Transparent border matches the skip button's 1.5px border so the two pills
    // have identical box heights and sit balanced on the row (founder soak r5).
    rateBtn: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rateText: { ...Typography.button.primary },
  });
