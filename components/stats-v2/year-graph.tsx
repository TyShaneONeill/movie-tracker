import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Fonts } from '@/constants/theme';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';
import type { GenreStats, MonthlyActivity } from '@/hooks/use-user-stats';
import { GenreBar } from './genre-bar';

/**
 * Stats v2 Your Year graph (design section 1C) — 12 vertical bars Jan→Dec for
 * the current year, with the Top Genres split bar (1D) inside the same card
 * under a divider.
 *
 * `monthlyActivity` from `useUserStats` is a rolling window keyed `YYYY-MM`;
 * months of the current year outside that window fill in as 0. Past months
 * are grey, the current month is full accent (rose gradient + glow, bold
 * label, underline tick), and future months are short dashed stubs. Bars grow
 * from 0 on mount, staggered.
 *
 * The whole card is hidden (renders null) when nothing is logged this year —
 * no empty graph. The +N% YoY badge is deliberately omitted: the design only
 * shows it when prior-year data exists, and `useUserStats` doesn't expose it.
 */

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MAX_BAR_HEIGHT = 116;
const MIN_BAR_HEIGHT = 5;
const FUTURE_STUB_HEIGHT = 13;
const BAR_ANIM_MS = 700;
const BAR_STAGGER_MS = 55;

function tapMonth(monthKey: string, monthIndex: number) {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  router.push(`/analytics/monthly?month=${monthKey}&label=${MONTH_LABELS[monthIndex]}`);
}

function MonthBar({
  count,
  monthIndex,
  monthKey,
  currentMonth,
  max,
  grow,
  c,
}: {
  count: number;
  monthIndex: number;
  monthKey: string;
  currentMonth: number;
  max: number;
  grow: Animated.Value;
  c: StatsV2ColorTokens;
}) {
  const future = monthIndex > currentMonth;
  const isCurrent = monthIndex === currentMonth;
  const barHeight = future ? 0 : Math.max((count / max) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT);

  return (
    <Pressable
      disabled={future}
      onPress={() => tapMonth(monthKey, monthIndex)}
      style={styles.monthColumn}
    >
      {/* count above the bar (elapsed months only) */}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={[
          styles.count,
          {
            color: isCurrent ? c.accent.primary : c.faint,
            fontFamily: isCurrent ? Fonts.mono.bold : Fonts.mono.regular,
            opacity: future ? 0 : 1,
          },
        ]}
      >
        {future ? '' : count}
      </Text>
      {/* bar lane */}
      <View style={styles.barLane}>
        {future ? (
          <View
            style={[
              styles.futureStub,
              { borderColor: c.bar.futureBorder, backgroundColor: c.bar.futureBg },
            ]}
          />
        ) : (
          <Animated.View
            style={[
              styles.bar,
              {
                height: grow.interpolate({ inputRange: [0, 1], outputRange: [0, barHeight] }),
              },
              isCurrent && {
                shadowColor: c.accent.primary,
                shadowOpacity: 0.45,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
                elevation: 5,
                // Android elevation needs an opaque surface to cast from; the
                // gradient child paints over it, so this never shows directly.
                backgroundColor: c.accent.deep,
                borderTopLeftRadius: 5,
                borderTopRightRadius: 5,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
              },
            ]}
          >
            <LinearGradient
              colors={
                isCurrent
                  ? [c.accent.primary, c.accent.deep]
                  : [c.bar.pastTop, c.bar.pastBottom]
              }
              style={styles.barFill}
            />
          </Animated.View>
        )}
      </View>
      {/* month letter + current-month underline tick */}
      <View style={styles.letterWrap}>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[
            styles.letter,
            {
              color: isCurrent ? c.text : future ? c.bar.futureLabel : c.faint,
              fontFamily: isCurrent ? Fonts.mono.bold : Fonts.mono.regular,
            },
          ]}
        >
          {MONTH_LETTERS[monthIndex]}
        </Text>
        {isCurrent && <View style={[styles.tick, { backgroundColor: c.accent.primary }]} />}
      </View>
    </Pressable>
  );
}

export function YearGraph({
  monthlyActivity,
  genres,
}: {
  monthlyActivity: MonthlyActivity[];
  genres: GenreStats[];
}) {
  const c = useStatsColors();

  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth();

  // Jan→Dec counts for the current year; months missing from the rolling
  // activity window fill with 0.
  const monthKeys = MONTH_LETTERS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const counts = monthKeys.map((key) => {
    const entry = monthlyActivity.find((m) => m.month === key);
    return entry ? entry.count : 0;
  });
  const yearTotal = counts.reduce((sum, n) => sum + n, 0);
  const max = Math.max(...counts, 1);

  // Bars grow from 0 on mount, staggered left→right; they replay when the
  // activity data changes (pull-to-refresh reveal).
  const growAnims = useRef(MONTH_LETTERS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (yearTotal === 0) return; // card is hidden — nothing to animate
    growAnims.forEach((anim) => anim.setValue(0));
    const stagger = Animated.stagger(
      BAR_STAGGER_MS,
      growAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: BAR_ANIM_MS,
          easing: Easing.bezier(0.2, 0.9, 0.2, 1),
          useNativeDriver: false, // animates height
        })
      )
    );
    stagger.start();
    return () => stagger.stop();
  }, [growAnims, monthlyActivity, yearTotal]);

  // No empty graph: the whole card disappears when nothing is logged this year.
  if (yearTotal === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
      {/* header */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, { color: c.ter }]}>
        YOUR YEAR · {year}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={[styles.total, { color: c.text }]}>
        {yearTotal}{' '}
        <Text style={[styles.totalUnit, { color: c.accent.primary }]}>movies</Text>
      </Text>

      {/* 12 bars, Jan→Dec */}
      <View style={styles.barsRow}>
        {counts.map((count, i) => (
          <MonthBar
            key={monthKeys[i]}
            count={count}
            monthIndex={i}
            monthKey={monthKeys[i]}
            currentMonth={currentMonth}
            max={max}
            grow={growAnims[i]}
            c={c}
          />
        ))}
      </View>

      {/* Top Genres (1D) under a divider */}
      {genres.length > 0 && (
        <>
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <GenreBar genres={genres} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.5,
  },
  total: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 32,
    lineHeight: 36, // Outfit clips at tight line heights — keep breathing room
    marginTop: 3,
  },
  totalUnit: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 15,
    lineHeight: 19,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginTop: 14,
  },
  monthColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
  },
  count: {
    fontSize: 9.5,
    lineHeight: 12,
    height: 12,
  },
  barLane: {
    width: '100%',
    height: MAX_BAR_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
  },
  barFill: {
    flex: 1,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  futureStub: {
    width: '100%',
    height: FUTURE_STUB_HEIGHT,
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  letterWrap: {
    height: 14,
    alignItems: 'center',
  },
  letter: {
    fontSize: 10,
    lineHeight: 14,
  },
  tick: {
    position: 'absolute',
    bottom: -3,
    width: 14,
    height: 2,
    borderRadius: 2,
  },
  divider: {
    height: 1,
    marginTop: 16,
    marginBottom: 14,
  },
});
