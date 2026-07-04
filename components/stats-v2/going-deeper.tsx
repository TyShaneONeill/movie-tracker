import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Fonts } from '@/constants/theme';
import { usePremium } from '@/hooks/use-premium';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';

/**
 * Stats v2 "Going deeper" section (design section 1E) — the future/insight
 * teaser chips below the Your Year card.
 *
 * A transparent 2-column grid of chips with internal grid lines only
 * (right/bottom borders on inner cells — no outer box, no per-chip fill).
 * A lone final chip (odd count) spans the full width, centered. A chip with a
 * `route` set in `GOING_DEEPER_FEATURES` is Pressable and pushes that route
 * (light haptic) — for BOTH members and free users: the destination screen
 * does its own premium gating, so a free tap lands on the gated deep-dive with
 * a "See Plans" CTA (the intended paywall funnel). Chips without a route (not
 * yet buildable) stay display-only. First routed chip: Rating Personality
 * (PS-22).
 *
 * Chip status matrix (per the design handoff README):
 *   free  + buildable            → lock + "PocketStubs+" (gold)
 *   free  + not-yet-buildable    → lock + "Coming soon" (neutral)
 *   member + buildable + data    → chevron + "Live for you" (emerald)
 *   member + buildable + sparse  → chevron + "Log a few more" (neutral)
 *   not-yet-buildable            → always "Coming soon", any membership
 *
 * The seasonal Wrapped banner shows only in-window (December → early
 * January); outside the window it is omitted entirely.
 */

export type GoingDeeperFeature = {
  key: string;
  title: string;
  blurb: string;
  /**
   * Whether the deep-dive is computable from data already in the schema
   * (README "Data Readiness"). Not-yet-buildable features read "Coming
   * soon" regardless of membership.
   */
  buildable: boolean;
  /** Set when the gated detail screen exists (PR 4) — enables navigation. */
  route?: string;
};

/**
 * The Going deeper feature list, from the design handoff's FUTURE dataset.
 * `buildable` follows the README's Data Readiness section: Taste Profile,
 * Rating Personality and Blind Spots are computable from the current schema
 * ("already have / easy — ship first"); Watch Streaks (daily watch-event
 * log), Theater vs. Home (watch_context), Runtime & Mood (per-watch
 * timestamps) and Friends Leaderboard (points ledger) need data/systems
 * that don't exist yet.
 */
export const GOING_DEEPER_FEATURES: GoingDeeperFeature[] = [
  {
    key: 'taste',
    title: 'Taste Profile',
    blurb: 'Your most-watched directors, actors and decades — surfaced automatically.',
    buildable: true,
  },
  {
    key: 'streaks',
    title: 'Watch Streaks',
    blurb: 'Longest streak, busiest weekday, and whether you’re on pace to beat last year.',
    buildable: false,
  },
  {
    key: 'rating-personality',
    title: 'Rating Personality',
    blurb: 'Are you generous or harsh? See how your scores stack up against everyone on PocketStubs.',
    buildable: true,
    route: '/analytics/rating-personality',
  },
  {
    key: 'blind-spots',
    title: 'Blind Spots',
    blurb: 'Genres and eras you under-watch — with a nudge toward a hidden gem.',
    buildable: true,
  },
  {
    key: 'context-split',
    title: 'Theater vs. Home',
    blurb: 'How your viewing splits across the cinema, the couch and 30,000 feet — plus popcorn spend.',
    buildable: false,
  },
  {
    key: 'friends',
    title: 'Friends Leaderboard',
    blurb: 'See who out-watched who this month across the people you follow.',
    buildable: false,
  },
  {
    key: 'runtime',
    title: 'Runtime & Mood',
    blurb: 'Average runtime, late-night vs. matinee, and the shape of a typical watch.',
    buildable: false,
  },
];

/** Logged titles needed before member insights read "Live for you". */
export const INSIGHTS_THRESHOLD = 5;

/** Wrapped banner window: all of December through early January. */
export function isWrappedSeason(now: Date): boolean {
  const month = now.getMonth();
  return month === 11 || (month === 0 && now.getDate() <= 7);
}

/** The year Wrapped looks back on — in January that's the year just ended. */
function wrappedYear(now: Date): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

type ChipStatus = {
  glyph: 'chevron-forward' | 'lock-closed-outline';
  icon: 'star' | 'time-outline';
  label: string;
  color: string;
};

function chipStatus(
  feature: GoingDeeperFeature,
  isPremium: boolean,
  insightsReady: boolean,
  c: StatsV2ColorTokens
): ChipStatus {
  if (!feature.buildable) {
    return { glyph: 'lock-closed-outline', icon: 'time-outline', label: 'Coming soon', color: c.status.neutral };
  }
  if (!isPremium) {
    return { glyph: 'lock-closed-outline', icon: 'star', label: 'PocketStubs+', color: c.gold };
  }
  if (!insightsReady) {
    return { glyph: 'chevron-forward', icon: 'time-outline', label: 'Log a few more', color: c.status.neutral };
  }
  return { glyph: 'chevron-forward', icon: 'star', label: 'Live for you', color: c.status.live };
}

export function GoingDeeper({ loggedCount, now = new Date() }: { loggedCount: number; now?: Date }) {
  const c = useStatsColors();
  const { isPremium, isLoading } = usePremium();
  const insightsReady = loggedCount >= INSIGHTS_THRESHOLD;

  const features = GOING_DEEPER_FEATURES;
  const n = features.length;
  // A lone chip on the final row spans the full width; the row above then
  // carries the full-width divider (both its cells get bottom borders).
  const lastRowCount = n % 2 === 0 ? 2 : 1;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.heading, { color: c.text }]}>
          Going deeper
        </Text>
        {/* Hold the caption until premium status resolves so members never
            see the free-tier teaser copy flash (mirrors the header pill). */}
        {!isLoading && (
          <Text maxFontSizeMultiplier={1.3} style={[styles.caption, { color: c.faint }]}>
            {isPremium ? 'your insights' : 'a taste of PocketStubs+'}
          </Text>
        )}
      </View>

      {/* Year in Review — seasonal banner, only in-window. Display-only
          until the Wrapped experience ships (seasonal aggregate job). */}
      {isWrappedSeason(now) && (
        <View style={[styles.wrapped, { borderColor: c.wrapped.border }]}>
          <LinearGradient
            colors={[c.wrapped.gradientStart, c.wrapped.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.wrappedRow}>
            <View style={[styles.wrappedIcon, { backgroundColor: c.wrapped.iconBg }]}>
              <Ionicons name="film-outline" size={24} color={c.accent.primary} />
            </View>
            <View style={styles.wrappedBody}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.wrappedTitle, { color: c.text }]}>
                Your {wrappedYear(now)}, Wrapped
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.wrappedBlurb, { color: c.sec }]}>
                A shareable look back at your whole year in film. Pick a badge for your profile.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.accent.primary} />
          </View>
          <View style={[styles.wrappedPill, { backgroundColor: c.wrapped.pillBg }]}>
            <Ionicons name="sparkles" size={12} color={c.wrapped.pillText} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.wrappedPillText, { color: c.wrapped.pillText }]}>
              Available now · free for everyone
            </Text>
          </View>
        </View>
      )}

      {/* transparent chip grid — internal grid lines only */}
      <View style={styles.grid}>
        {features.map((feature, i) => {
          const span = i === n - 1 && n % 2 === 1 && n > 1;
          const hasRight = !span && i % 2 === 0 && i + 1 < n;
          const hasBelow = i < n - lastRowCount;
          const status = chipStatus(feature, isPremium, insightsReady, c);
          const route = feature.route;
          const chipStyle = [
            span ? styles.chipSpan : styles.chip,
            hasRight && { borderRightWidth: 1, borderRightColor: c.line },
            hasBelow && { borderBottomWidth: 1, borderBottomColor: c.line },
          ];
          // Titles/blurbs render immediately for stable layout, but the
          // glyph + status line hold until premium resolves (same reason
          // as the caption: members never see the free-tier state flash).
          const chipBody = (
            <>
              <View style={span ? styles.chipTitleRowSpan : styles.chipTitleRow}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.chipTitle, span && styles.chipTextCentered, { color: c.text }]}
                >
                  {feature.title}
                </Text>
                {!isLoading && (
                  <Ionicons
                    name={status.glyph}
                    size={status.glyph === 'chevron-forward' ? 15 : 13}
                    color={c.faint}
                    style={styles.chipGlyph}
                  />
                )}
              </View>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.chipBlurb, span && styles.chipBlurbSpan, { color: c.ter }]}
              >
                {feature.blurb}
              </Text>
              {!isLoading && (
                <View style={styles.chipStatusRow}>
                  <Ionicons name={status.icon} size={10} color={status.color} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.chipStatusText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              )}
            </>
          );

          if (route) {
            return (
              <Pressable
                key={feature.key}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.push(route as never);
                }}
                accessibilityRole="button"
                accessibilityLabel={feature.title}
                style={({ pressed }) => [...chipStyle, pressed && { opacity: 0.6 }]}
              >
                {chipBody}
              </Pressable>
            );
          }

          return (
            <View key={feature.key} style={chipStyle}>
              {chipBody}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  heading: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 19,
    lineHeight: 24, // Outfit clips at tight line heights — keep breathing room
  },
  caption: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11.5,
    lineHeight: 15,
  },
  wrapped: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  wrappedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wrappedIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrappedBody: {
    flex: 1,
    minWidth: 0,
  },
  wrappedTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 17,
    lineHeight: 22,
  },
  wrappedBlurb: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  wrappedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  wrappedPillText: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    width: '50%',
    minHeight: 116,
    padding: 14,
    paddingVertical: 16,
    gap: 10,
  },
  chipSpan: {
    width: '100%',
    alignItems: 'center',
    padding: 14,
    paddingVertical: 16,
    gap: 6,
  },
  chipTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  chipTitleRowSpan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipTitle: {
    flexShrink: 1,
    fontFamily: Fonts.outfit.bold,
    fontSize: 15,
    lineHeight: 19,
  },
  chipTextCentered: {
    textAlign: 'center',
  },
  chipGlyph: {
    marginTop: 1,
  },
  chipBlurb: {
    flex: 1,
    fontFamily: Fonts.inter.regular,
    fontSize: 11.5,
    lineHeight: 15.5,
  },
  chipBlurbSpan: {
    flex: 0,
    maxWidth: 300,
    textAlign: 'center',
  },
  chipStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chipStatusText: {
    fontFamily: Fonts.inter.bold,
    fontSize: 9.5,
    lineHeight: 13,
  },
});
