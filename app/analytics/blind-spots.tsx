import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Fonts } from '@/constants/theme';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';
import { useEffectiveColorScheme } from '@/lib/theme-context';
import { usePremium } from '@/hooks/use-premium';
import { useBlindSpots } from '@/hooks/use-blind-spots';
import { INSIGHTS_THRESHOLD } from '@/components/stats-v2/going-deeper';
import { Gated } from '@/components/stats-v2/gated-section';
import { ContentContainer } from '@/components/content-container';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { BlindSpots, EraCoverage, GenreGap, Pick } from '@/lib/blind-spots';

/**
 * Blind Spots deep-dive (design handoff §3, `stats-blindspots.jsx`; vault
 * PS-22) — the second "Going deeper" detail screen. Recreates the mockup in
 * RN with `useStatsColors()` tokens: the spotlight teaser card, the era
 * coverage bars, the genre-gap rows, and the "Start here" entry-point picks.
 *
 * Gating (member vs free) uses `usePremium()`, mirroring `rating-personality.tsx`:
 *   • Free  → the spotlight card is the TEASER and stays visible (matches the
 *             mockup, which only blurs the proof below it). Era coverage,
 *             genre gaps, and the "Start here" picks render CANNED
 *             placeholder data behind the shared `Gated` blur + lock pill —
 *             the user's real gaps are never mounted while gated, so nothing
 *             legible sits under a weak blur (Android). A "See Plans" button
 *             routes to /upgrade.
 *   • Member → full content.
 * Below the 5-watched-movie insight threshold everyone (members included)
 * sees an "Almost there" empty state instead of data.
 */
export default function BlindSpotsScreen() {
  const c = useStatsColors();
  const scheme = useEffectiveColorScheme();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const { data, isLoading, isError, error } = useBlindSpots();

  const gated = !premiumLoading && !isPremium;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]} edges={['top']}>
      <ContentContainer style={{ flex: 1 }}>
        <DetailHeader c={c} />
        {isLoading || premiumLoading ? (
          <View style={styles.centerFlex}>
            <ActivityIndicator size="large" color={c.accent.primary} />
          </View>
        ) : isError ? (
          <View style={styles.centerFlex}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Couldn&apos;t load your blind spots</Text>
            <Text style={[styles.emptyMessage, { color: c.sec }]}>
              {error instanceof Error ? error.message : 'Something went wrong. Pull back and try again.'}
            </Text>
          </View>
        ) : !data || data.watchedCount < INSIGHTS_THRESHOLD ? (
          <AlmostThere c={c} watchedCount={data?.watchedCount ?? 0} />
        ) : (
          <Content c={c} scheme={scheme} bs={data} gated={gated} />
        )}
      </ContentContainer>
    </SafeAreaView>
  );
}

function DetailHeader({ c }: { c: StatsV2ColorTokens }) {
  return (
    <View style={[styles.header, Platform.OS === 'web' && styles.headerWeb]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={22} color={c.text} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
          Blind Spots
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.headerSubtitle, { color: c.sec }]} numberOfLines={1}>
          The map of what you&apos;re missing
        </Text>
      </View>
      <View style={styles.headerButton} />
    </View>
  );
}

/** Canned era bars shown to free users under the paywall blur — deliberately
 *  plausible-looking, never the user's real coverage (see gating note up top). */
const PLACEHOLDER_ERAS: EraCoverage[] = [
  { era: 'pre70s', label: '–70s', pct: 4, isGap: true },
  { era: '70s', label: '70s', pct: 8, isGap: true },
  { era: '80s', label: '80s', pct: 14, isGap: true },
  { era: '90s', label: '90s', pct: 27, isGap: false },
  { era: '00s', label: '00s', pct: 52, isGap: false },
  { era: '10s', label: '10s', pct: 74, isGap: false },
  { era: '20s', label: '20s', pct: 88, isGap: false },
];

/** Canned genre rows shown to free users under the paywall blur. */
const PLACEHOLDER_GENRES: GenreGap[] = [
  { genreId: -1, name: 'Western', watched: 0 },
  { genreId: -2, name: 'Music', watched: 1 },
  { genreId: -3, name: 'Documentary', watched: 2 },
  { genreId: -4, name: 'History', watched: 3 },
];

function Content({
  c,
  scheme,
  bs,
  gated,
}: {
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  bs: BlindSpots;
  gated: boolean;
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Spotlight — not gated, it's the teaser (matches the mockup). */}
      {bs.spotlight ? (
        <>
          <View style={[styles.spotlightCard, { borderColor: 'rgba(251,113,133,0.22)' }]}>
            <LinearGradient
              colors={['rgba(251,113,133,0.12)', 'rgba(124,45,18,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Image
              source={{ uri: getTMDBImageUrl(bs.spotlight.posterPath, 'w185') ?? undefined }}
              style={[styles.spotlightPoster, { backgroundColor: c.cardHi }]}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.spotlightBody}>
              <Text maxFontSizeMultiplier={1.3} style={styles.spotlightEyebrow}>
                YOUR BIGGEST SURPRISE
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.spotlightTitle, { color: c.text }]}>
                {bs.spotlight.title}{' '}
                <Text style={[styles.spotlightYear, { color: c.ter }]}>({bs.spotlight.year})</Text>
              </Text>
              <Text maxFontSizeMultiplier={1.4} style={[styles.spotlightStatRow, { color: c.sec }]}>
                <Text style={styles.spotlightStat}>{bs.spotlight.stat}</Text> {bs.spotlight.statLabel}
              </Text>
            </View>
          </View>
          <Text maxFontSizeMultiplier={1.4} style={[styles.spotlightReason, { color: c.sec }]}>
            {bs.spotlight.reason}
          </Text>
        </>
      ) : (
        <View style={[styles.card, styles.emptySpotlight, { backgroundColor: c.card, borderColor: c.line }]}>
          <Ionicons name="film-outline" size={24} color={c.faint} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.emptyDivergeText, { color: c.sec }]}>
            You&apos;ve covered every film in our canon — no surprises left to surface. That&apos;s rare.
          </Text>
        </View>
      )}

      {/* Coverage by era — gated. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, styles.sectionEyebrow, { color: c.ter }]}>
        COVERAGE BY ERA
      </Text>
      {/* While gated the Gated wrapper owns the bottom margin — a margin on
          the card would grow the wrapper and the blur would paint a frosted
          strip past the card edge (same rule as rating-personality). */}
      <Gated gated={gated} c={c} scheme={scheme}>
        <View style={[styles.card, gated && styles.cardInGate, { backgroundColor: c.card, borderColor: c.line }]}>
          <EraCoverageBars c={c} eras={gated ? PLACEHOLDER_ERAS : bs.eras} />
        </View>
      </Gated>

      {/* Genres you skip — gated. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, styles.sectionEyebrow, { color: c.ter }]}>
        GENRES YOU SKIP
      </Text>
      <Gated gated={gated} c={c} scheme={scheme}>
        <View style={[styles.card, gated && styles.cardInGate, { backgroundColor: c.card, borderColor: c.line }]}>
          <GenreGapRows c={c} genres={gated ? PLACEHOLDER_GENRES : bs.genreGaps} />
        </View>
      </Gated>

      {/* Start here — gated. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.picksHeading, { color: c.text }]}>
        Start here
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={[styles.picksSub, { color: c.ter }]}>
        The door into each blind spot — picked for how you already watch.
      </Text>
      <Gated gated={gated} c={c} scheme={scheme}>
        {gated ? (
          <PlaceholderPicks c={c} />
        ) : bs.picks.length > 0 ? (
          <View>
            {bs.picks.map((p) => (
              <PickRow key={p.tmdbId} p={p} c={c} />
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyDiverge, { backgroundColor: c.card, borderColor: c.line }]}>
            <Ionicons name="checkmark-circle-outline" size={24} color={c.faint} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.emptyDivergeText, { color: c.sec }]}>
              No entry points left — you&apos;ve already watched every film we&apos;d point you toward.
            </Text>
          </View>
        )}
      </Gated>

      {gated && (
        <Pressable
          onPress={() => router.push('/upgrade')}
          style={({ pressed }) => [styles.seePlans, { backgroundColor: c.gold, opacity: pressed ? 0.9 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="See Plans"
        >
          <Text maxFontSizeMultiplier={1.2} style={styles.seePlansText}>
            See Plans
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function EraCoverageBars({ c, eras }: { c: StatsV2ColorTokens; eras: EraCoverage[] }) {
  return (
    <View>
      <View style={styles.eraRow}>
        {eras.map((e) => (
          <View key={e.era} style={styles.eraCol}>
            <Text
              maxFontSizeMultiplier={1.2}
              style={[styles.eraPct, { color: e.isGap ? '#fb7185' : c.faint, fontWeight: e.isGap ? '700' : '400' }]}
            >
              {e.pct}%
            </Text>
            <View style={[styles.eraTrack, { backgroundColor: c.cardHi }]}>
              <LinearGradient
                colors={e.isGap ? ['#fb7185', '#9f1239'] : [c.bar.pastTop, c.bar.pastBottom]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.eraBar, { height: `${Math.max(e.pct, 3)}%` }]}
              />
            </View>
            <Text maxFontSizeMultiplier={1.2} style={[styles.eraLabel, { color: e.isGap ? '#fb7185' : c.ter }]}>
              {e.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GenreGapRows({ c, genres }: { c: StatsV2ColorTokens; genres: GenreGap[] }) {
  return (
    <View style={styles.genreList}>
      {genres.map((g) => (
        <View key={g.genreId} style={styles.genreRow}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.genreName, { color: c.text }]} numberOfLines={1}>
            {g.name}
          </Text>
          <View style={[styles.genreTrack, { backgroundColor: c.cardHi }]}>
            <View
              style={[
                styles.genreFill,
                { width: `${Math.min(g.watched * 8 + 3, 100)}%`, backgroundColor: c.accent.primary },
              ]}
            />
          </View>
          <Text
            maxFontSizeMultiplier={1.2}
            style={[styles.genreCount, { color: g.watched === 0 ? '#fb7185' : c.sec }]}
          >
            {g.watched === 0 ? 'none yet' : `${g.watched} seen`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PickRow({ p, c }: { p: Pick; c: StatsV2ColorTokens }) {
  return (
    <View style={[styles.pickRow, { borderBottomColor: c.line }]}>
      <Image
        source={{ uri: getTMDBImageUrl(p.posterPath, 'w185') ?? undefined }}
        style={[styles.pickPoster, { backgroundColor: c.cardHi }]}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.pickInfo}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.pickTitle, { color: c.text }]} numberOfLines={1}>
          {p.title} <Text style={{ color: c.ter, fontWeight: '400' }}>({p.year})</Text>
        </Text>
        <View style={styles.pickMetaRow}>
          <View style={[styles.gapTag, { backgroundColor: 'rgba(139,92,246,0.14)' }]}>
            <Text maxFontSizeMultiplier={1.1} style={styles.gapTagText}>
              {p.gapTag}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={styles.pickSocial}>
            {p.social}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[styles.pickReason, { color: c.sec }]}>
          {p.reason}
        </Text>
      </View>
    </View>
  );
}

/** Skeleton stand-ins for the pick rows shown to free users — real rows are
 *  never mounted while gated, so nothing legible sits under a weak blur. */
function PlaceholderPicks({ c }: { c: StatsV2ColorTokens }) {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.pickRow, { borderBottomColor: c.line }]}>
          <View style={[styles.pickPoster, { backgroundColor: c.cardHi }]} />
          <View style={styles.pickInfo}>
            <View style={[styles.skelBar, styles.skelTitle, { backgroundColor: c.cardHi }]} />
            <View style={[styles.skelBar, styles.skelChip, { backgroundColor: c.cardHi }]} />
            <View style={[styles.skelBar, styles.skelReason, { backgroundColor: c.cardHi }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function AlmostThere({ c, watchedCount }: { c: StatsV2ColorTokens; watchedCount: number }) {
  const remaining = Math.max(0, INSIGHTS_THRESHOLD - watchedCount);
  return (
    <View style={styles.centerFlex}>
      <View style={styles.emptyStubs}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.emptyStub, { borderColor: c.lineHi, backgroundColor: c.bar.futureBg }]}
          />
        ))}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.emptyTitle, { color: c.text }]}>
        Almost there
      </Text>
      <Text maxFontSizeMultiplier={1.4} style={[styles.emptyMessage, { color: c.sec }]}>
        Log {remaining} more {remaining === 1 ? 'movie' : 'movies'} and we&apos;ll map out the eras and
        genres you&apos;ve been skipping.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16, // match stats-v2-screen contentContainer
    paddingBottom: 120,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 14,
  },
  headerWeb: {
    paddingTop: 16,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 19,
    lineHeight: 24,
  },
  headerSubtitle: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 1,
  },

  // ── Cards / eyebrows ────────────────────────────────────────────────────
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardInGate: {
    marginBottom: 0,
  },
  eyebrow: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  sectionEyebrow: {
    marginHorizontal: 2,
    marginTop: 4,
    marginBottom: 12,
  },

  // ── Spotlight ───────────────────────────────────────────────────────────
  spotlightCard: {
    flexDirection: 'row',
    gap: 16,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  spotlightPoster: {
    width: 76,
    height: 114,
    borderRadius: 9,
    flexShrink: 0,
  },
  spotlightBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  spotlightEyebrow: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#fb7185',
    textTransform: 'uppercase',
  },
  spotlightTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 19,
    lineHeight: 24,
    marginTop: 4,
  },
  spotlightYear: {
    fontFamily: Fonts.inter.regular,
    fontSize: 15,
  },
  spotlightStatRow: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  spotlightStat: {
    fontFamily: Fonts.mono.bold,
    fontSize: 14,
    color: '#fb7185',
  },
  spotlightReason: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 19,
    marginHorizontal: 2,
    marginBottom: 22,
  },
  emptySpotlight: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 22,
  },

  // ── Era coverage ────────────────────────────────────────────────────────
  eraRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  eraCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  eraPct: {
    fontFamily: Fonts.mono.regular,
    fontSize: 9,
  },
  eraTrack: {
    width: '100%',
    height: 56,
    borderRadius: 5,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  eraBar: {
    width: '100%',
    minHeight: 3,
    borderRadius: 4,
  },
  eraLabel: {
    fontFamily: Fonts.mono.regular,
    fontSize: 9.5,
  },

  // ── Genre gaps ──────────────────────────────────────────────────────────
  genreList: {
    gap: 12,
  },
  genreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  genreName: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    width: 100,
    flexShrink: 0,
  },
  genreTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  genreFill: {
    height: '100%',
    borderRadius: 3,
  },
  genreCount: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    width: 64,
    textAlign: 'right',
    flexShrink: 0,
  },

  // ── Start here picks ────────────────────────────────────────────────────
  picksHeading: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 18,
    lineHeight: 23,
    marginHorizontal: 2,
    marginTop: 4,
  },
  picksSub: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginHorizontal: 2,
    marginTop: 4,
    marginBottom: 12,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 13,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  pickPoster: {
    width: 50,
    height: 75,
    borderRadius: 7,
    flexShrink: 0,
  },
  pickInfo: {
    flex: 1,
    minWidth: 0,
  },
  pickTitle: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 14.5,
    lineHeight: 19,
  },
  pickMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
    marginBottom: 5,
  },
  gapTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gapTagText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    color: '#c4b5fd',
  },
  pickSocial: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 11,
    color: '#10b981',
  },
  pickReason: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  skelBar: {
    borderRadius: 4,
  },
  skelTitle: {
    height: 12,
    width: '60%',
    marginBottom: 8,
  },
  skelChip: {
    height: 18,
    width: '35%',
    marginBottom: 8,
  },
  skelReason: {
    height: 10,
    width: '90%',
  },
  emptyDiverge: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyDivergeText: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 300,
  },

  // ── See Plans ───────────────────────────────────────────────────────────
  seePlans: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginHorizontal: 2,
  },
  seePlansText: {
    fontFamily: Fonts.inter.bold,
    fontSize: 16,
    color: '#1a1a1a',
  },

  // ── Loading / empty / error ─────────────────────────────────────────────
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emptyStubs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 22,
  },
  emptyStub: {
    width: 34,
    height: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: Fonts.inter.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
