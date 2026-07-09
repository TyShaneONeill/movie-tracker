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
import { useTasteInsights } from '@/hooks/use-taste-insights';
import { INSIGHTS_THRESHOLD } from '@/components/stats-v2/going-deeper';
import { Gated } from '@/components/stats-v2/gated-section';
import { ContentContainer } from '@/components/content-container';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TasteInsights, Pick } from '@/lib/taste-profile';
import { formatTopDirectors } from '@/lib/taste-profile';

/**
 * Taste Profile deep-dive (vault PS-22) — the third "Going deeper" detail
 * screen. Purple/rose "PocketStubs AI" read card (top directors + studio,
 * cached server-side) + a favorite-decade/comfort-genre stat grid (computed
 * instantly, client-side) + "Picked for you" recs.
 *
 * Gating mirrors rating-personality.tsx / blind-spots.tsx: there's no free
 * teaser piece here (unlike the verdict scale or blind-spots' spotlight) —
 * the AI read + stats + picks ARE the premium payload, so the whole content
 * body is wrapped in one `Gated`, with CANNED placeholder data under the
 * blur (never the user's real read/stats/picks — see gated-section.tsx).
 * Below the 5-watched-movie insight threshold everyone (members included)
 * sees an "Almost there" empty state instead.
 */
export default function TasteProfileScreen() {
  const c = useStatsColors();
  const scheme = useEffectiveColorScheme();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const { data, isLoading, isError, error, regenerate, isRegenerating, regenerateError } = useTasteInsights();

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
            <Text style={[styles.emptyTitle, { color: c.text }]}>Couldn&apos;t load your taste profile</Text>
            <Text style={[styles.emptyMessage, { color: c.sec }]}>
              {error instanceof Error ? error.message : 'Something went wrong. Pull back and try again.'}
            </Text>
          </View>
        ) : !data || data.watchedCount < INSIGHTS_THRESHOLD ? (
          <AlmostThere c={c} watchedCount={data?.watchedCount ?? 0} />
        ) : (
          <Content
            c={c}
            scheme={scheme}
            tp={data}
            gated={gated}
            isRegenerating={isRegenerating}
            regenerateError={regenerateError}
            onRegenerate={() => regenerate()}
          />
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
          Taste Profile
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.headerSubtitle, { color: c.sec }]} numberOfLines={1}>
          Your cinematic fingerprint
        </Text>
      </View>
      <View style={styles.headerButton} />
    </View>
  );
}

/** Canned AI-card copy + stats shown to free users under the paywall blur —
 *  deliberately plausible-looking, never the user's real read (see gating
 *  note up top). */
const PLACEHOLDER_SUMMARY =
  "You lean toward moody, director-driven dramas — the kind of films that reward a second watch, from directors who trust an audience to sit with silence.";
const PLACEHOLDER_STATS = {
  topDirector: 'Denis Villeneuve',
  topDecade: '2010s',
  topStudio: 'A24',
  comfortGenre: 'Drama',
};

function Content({
  c,
  scheme,
  tp,
  gated,
  isRegenerating,
  regenerateError,
  onRegenerate,
}: {
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  tp: TasteInsights;
  gated: boolean;
  isRegenerating: boolean;
  regenerateError: Error | null;
  onRegenerate: () => void;
}) {
  const topDirector = formatTopDirectors(tp.cache?.topDirectors ?? []);
  const topStudio = tp.cache?.topStudio ?? null;
  const topDecade = tp.topDecade?.decade ?? null;
  const comfortGenreName = tp.comfortGenre?.name ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Gated gated={gated} c={c} scheme={scheme}>
        <View style={gated && styles.cardInGate}>
          <AiSummaryCard
            c={c}
            summary={gated ? PLACEHOLDER_SUMMARY : tp.cache?.summary ?? null}
            isRegenerating={!gated && isRegenerating}
            regenerateError={gated ? null : regenerateError}
            onRegenerate={onRegenerate}
          />

          <View style={styles.statsGrid}>
            <StatCell
              c={c}
              label="Top director"
              value={gated ? PLACEHOLDER_STATS.topDirector : topDirector}
              borderRight
              borderBottom
            />
            <StatCell
              c={c}
              label="Favorite decade"
              value={gated ? PLACEHOLDER_STATS.topDecade : topDecade}
              borderBottom
            />
            <StatCell
              c={c}
              label="Top studio"
              value={gated ? PLACEHOLDER_STATS.topStudio : topStudio}
              borderRight
            />
            <StatCell
              c={c}
              label="Comfort genre"
              value={gated ? PLACEHOLDER_STATS.comfortGenre : comfortGenreName}
            />
          </View>

          <Text maxFontSizeMultiplier={1.3} style={[styles.picksHeading, { color: c.text }]}>
            Picked for you
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.picksSub, { color: c.ter }]}>
            Unwatched films that match how you already watch.
          </Text>
          {gated ? (
            <PlaceholderPicks c={c} />
          ) : tp.picks.length > 0 ? (
            <View>
              {tp.picks.map((p) => (
                <PickRow key={p.tmdbId} p={p} genreLabel={comfortGenreName} c={c} />
              ))}
            </View>
          ) : (
            <View style={[styles.card, styles.emptyPicks, { backgroundColor: c.card, borderColor: c.line }]}>
              <Ionicons name="checkmark-circle-outline" size={24} color={c.faint} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.emptyPicksText, { color: c.sec }]}>
                No picks left in your comfort genre — you&apos;ve already watched our top recommendations there.
              </Text>
            </View>
          )}
        </View>
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

function AiSummaryCard({
  c,
  summary,
  isRegenerating,
  regenerateError,
  onRegenerate,
}: {
  c: StatsV2ColorTokens;
  summary: string | null;
  isRegenerating: boolean;
  regenerateError: Error | null;
  onRegenerate: () => void;
}) {
  return (
    <View style={[styles.aiCard, { borderColor: 'rgba(196,181,253,0.28)' }]}>
      <LinearGradient
        colors={['rgba(139,92,246,0.16)', 'rgba(251,113,133,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.aiPillRow}>
        <View style={styles.aiPill}>
          <Ionicons name="sparkles" size={12} color="#c4b5fd" />
          <Text maxFontSizeMultiplier={1.2} style={styles.aiPillText}>
            PocketStubs AI
          </Text>
        </View>
        <Pressable
          onPress={onRegenerate}
          disabled={isRegenerating}
          style={({ pressed }) => [
            styles.regenerateButton,
            { borderColor: c.line, opacity: pressed || isRegenerating ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Regenerate taste read"
        >
          {isRegenerating ? (
            <ActivityIndicator size="small" color={c.sec} />
          ) : (
            <Ionicons name="refresh" size={15} color={c.sec} />
          )}
        </Pressable>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={[styles.aiSummary, { color: c.text }]}>
        {summary ?? (isRegenerating ? 'Crunching your taste read…' : 'Your taste read will appear here shortly.')}
      </Text>
      {regenerateError && (
        <Text maxFontSizeMultiplier={1.3} style={[styles.aiError, { color: '#fb7185' }]}>
          {regenerateError.message}
        </Text>
      )}
    </View>
  );
}

function StatCell({
  c,
  label,
  value,
  borderRight,
  borderBottom,
}: {
  c: StatsV2ColorTokens;
  label: string;
  value: string | null;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <View
      style={[
        styles.statCell,
        borderRight && { borderRightWidth: 1, borderRightColor: c.line },
        borderBottom && { borderBottomWidth: 1, borderBottomColor: c.line },
      ]}
    >
      <Text maxFontSizeMultiplier={1.3} style={[styles.statLabel, { color: c.ter }]}>
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[styles.statValue, { color: value ? c.text : c.faint }]}
        numberOfLines={2}
      >
        {value ?? '—'}
      </Text>
    </View>
  );
}

function PickRow({ p, genreLabel, c }: { p: Pick; genreLabel: string | null; c: StatsV2ColorTokens }) {
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
          {genreLabel && (
            <View style={[styles.gapTag, { backgroundColor: 'rgba(139,92,246,0.14)' }]}>
              <Text maxFontSizeMultiplier={1.1} style={styles.gapTagText}>
                {genreLabel}
              </Text>
            </View>
          )}
          <Text maxFontSizeMultiplier={1.2} style={styles.pickSocial}>
            TMDB {p.voteAverage.toFixed(1)}
          </Text>
        </View>
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
        Log {remaining} more {remaining === 1 ? 'movie' : 'movies'} and we&apos;ll map your directors,
        decades, and comfort genres.
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

  // ── AI card ─────────────────────────────────────────────────────────────
  aiCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  aiPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  aiPillText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10.5,
    letterSpacing: 0.6,
    color: '#c4b5fd',
  },
  regenerateButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSummary: {
    fontFamily: Fonts.inter.regular,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 14,
  },
  aiError: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 10,
  },

  // ── Stats grid ──────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  statCell: {
    width: '50%',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statLabel: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  statValue: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 18,
    lineHeight: 23,
    marginTop: 4,
  },

  // ── Picked for you ──────────────────────────────────────────────────────
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
    justifyContent: 'center',
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
    marginTop: 6,
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
  },
  emptyPicks: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyPicksText: {
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
