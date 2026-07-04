import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { Fonts } from '@/constants/theme';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';
import { useEffectiveColorScheme } from '@/lib/theme-context';
import { usePremium } from '@/hooks/use-premium';
import { useRatingPersonality } from '@/hooks/use-rating-personality';
import { INSIGHTS_THRESHOLD } from '@/components/stats-v2/going-deeper';
import { ContentContainer } from '@/components/content-container';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { DivergenceRow, RatingPersonality } from '@/lib/rating-personality';

const NEGATIVE = '#fb7185'; // rose-400 — negative delta (matches design handoff)

/**
 * Rating Personality deep-dive (design handoff §3, `stats-rating.jsx`; vault
 * PS-22) — the first "Going deeper" detail screen. Recreates the mockup in RN
 * with `useStatsColors()` tokens: the harsh→generous verdict scale, the "The
 * numbers" lined grid, a paired you-vs-community distribution histogram, and
 * the "Where you part ways" divergence rows.
 *
 * Gating (member vs free) uses `usePremium()`:
 *   • Free  → the distribution + divergence sections are blurred behind a lock
 *             pill; a "See Plans" button routes to /upgrade (same as the
 *             ranked-detail paywall). Verdict + "The numbers" stay visible as a
 *             teaser (matching the mockup, which only blurs the proof).
 *   • Member → full content.
 * Below the 5-rating insight threshold everyone (members included) sees an
 * "Almost there" empty state instead of data.
 */
export default function RatingPersonalityScreen() {
  const c = useStatsColors();
  const scheme = useEffectiveColorScheme();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const { data, isLoading, isError, error } = useRatingPersonality();

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
            <Text style={[styles.emptyTitle, { color: c.text }]}>Couldn&apos;t load your ratings</Text>
            <Text style={[styles.emptyMessage, { color: c.sec }]}>
              {error instanceof Error ? error.message : 'Something went wrong. Pull back and try again.'}
            </Text>
          </View>
        ) : !data || data.rated < INSIGHTS_THRESHOLD ? (
          <AlmostThere c={c} rated={data?.rated ?? 0} />
        ) : (
          <Content c={c} scheme={scheme} rp={data} gated={gated} />
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
          Rating Personality
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.headerSubtitle, { color: c.sec }]} numberOfLines={1}>
          How you score vs everyone else
        </Text>
      </View>
      <View style={styles.headerButton} />
    </View>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const up = delta >= 0;
  const color = up ? '#10b981' : NEGATIVE;
  return (
    <View
      style={[
        styles.deltaChip,
        { backgroundColor: up ? 'rgba(16,185,129,0.14)' : 'rgba(251,113,133,0.14)' },
      ]}
    >
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={11} color={color} />
      <Text maxFontSizeMultiplier={1.2} style={[styles.deltaChipText, { color }]}>
        {up ? '+' : ''}
        {delta.toFixed(1)}
      </Text>
    </View>
  );
}

/** Gated wrapper — blurs children behind a centered "Unlock" pill for free
 *  users; renders children as-is for members. */
function Gated({
  gated,
  c,
  scheme,
  children,
}: {
  gated: boolean;
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  children: React.ReactNode;
}) {
  if (!gated) return <>{children}</>;
  return (
    <View style={styles.gatedWrap}>
      <View pointerEvents="none">{children}</View>
      {/* dimezisBlurView: without it Android renders a translucent tint, not a
          blur, and the gated content stays legible — see journey/[id].tsx. */}
      <BlurView
        intensity={40}
        tint={scheme === 'light' ? 'light' : 'dark'}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gatedOverlay} pointerEvents="none">
        <View style={[styles.lockPill, { backgroundColor: c.card, borderColor: c.line }]}>
          <Ionicons name="lock-closed" size={14} color={c.gold} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.lockPillText, { color: c.gold }]}>
            Unlock with PocketStubs+
          </Text>
        </View>
      </View>
    </View>
  );
}

function Content({
  c,
  scheme,
  rp,
  gated,
}: {
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  rp: RatingPersonality;
  gated: boolean;
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Verdict — the scale is the hero (no icon). */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, { color: c.ter }]}>
          YOUR VERDICT
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.verdictTitle, { color: c.text }]}>
          You lean {rp.verdict}
        </Text>
        <VerdictScale c={c} scheme={scheme} position={rp.position} communityMarker={rp.communityMarker} />
        <View style={styles.scaleLabels}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.scaleLabel, { color: c.ter }]}>
            Harsh
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={[styles.scaleLabel, { color: c.ter }]}>
            Generous
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.4} style={[styles.blurb, { color: c.sec }]}>
          {rp.blurb}
        </Text>
      </View>

      {/* The numbers — 2-col lined grid. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, styles.sectionEyebrow, { color: c.ter }]}>
        THE NUMBERS
      </Text>
      <View style={styles.numbersGrid}>
        <View style={[styles.numberCell, { borderRightColor: c.line, borderBottomColor: c.line }, styles.cellRight, styles.cellBottom]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberLabel, { color: c.ter }]}>
            Your average
          </Text>
          <View style={styles.numberValueRow}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.numberValue, { color: c.gold }]}>
              {rp.yourAvg.toFixed(1)}
            </Text>
            <DeltaChip delta={rp.delta} />
          </View>
        </View>
        <View style={[styles.numberCell, { borderBottomColor: c.line }, styles.cellBottom]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberLabel, { color: c.ter }]}>
            PocketStubs average
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberValue, { color: c.text }]}>
            {rp.communityAvg.toFixed(1)}
          </Text>
        </View>
        <View style={[styles.numberCell, { borderRightColor: c.line }, styles.cellRight]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberLabel, { color: c.ter }]}>
            Ratings counted
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberValue, { color: c.text }]}>
            {rp.rated}
          </Text>
        </View>
        <View style={styles.numberCell}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberLabel, { color: c.ter }]}>
            You rate 8 or higher
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.numberValue, { color: c.text }]}>
            {rp.pctHigh}%
          </Text>
        </View>
      </View>

      {/* Distribution — gated. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.eyebrow, styles.sectionEyebrow, { color: c.ter }]}>
        HOW YOUR SCORES FALL
      </Text>
      <Gated gated={gated} c={c} scheme={scheme}>
        <View style={[styles.card, styles.distCard, { backgroundColor: c.card, borderColor: c.line }]}>
          <Distribution c={c} rp={rp} />
        </View>
      </Gated>

      {/* Divergence — gated; honest empty state when there's no overlap yet. */}
      <Text maxFontSizeMultiplier={1.3} style={[styles.divergeHeading, { color: c.text }]}>
        Where you part ways
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={[styles.divergeSub, { color: c.ter }]}>
        Your biggest gaps from the PocketStubs consensus.
      </Text>
      <Gated gated={gated} c={c} scheme={scheme}>
        {rp.hasDivergenceData ? (
          <View>
            {rp.generous.length > 0 && (
              <>
                <View style={styles.divergeGroupHeader}>
                  <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                  <Text maxFontSizeMultiplier={1.2} style={[styles.divergeGroupText, { color: '#10b981' }]}>
                    More generous than the crowd
                  </Text>
                </View>
                {rp.generous.map((r) => (
                  <DivergeRowView key={`gen-${r.tmdbId}`} r={r} c={c} />
                ))}
              </>
            )}
            {rp.tougher.length > 0 && (
              <>
                <View style={[styles.divergeGroupHeader, styles.divergeGroupSpaced]}>
                  <View style={[styles.dot, { backgroundColor: NEGATIVE }]} />
                  <Text maxFontSizeMultiplier={1.2} style={[styles.divergeGroupText, { color: NEGATIVE }]}>
                    Tougher than the crowd
                  </Text>
                </View>
                {rp.tougher.map((r) => (
                  <DivergeRowView key={`tuf-${r.tmdbId}`} r={r} c={c} />
                ))}
              </>
            )}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyDiverge, { backgroundColor: c.card, borderColor: c.line }]}>
            <Ionicons name="people-outline" size={24} color={c.faint} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.emptyDivergeText, { color: c.sec }]}>
              Not enough overlap yet — as more members rate these films, you&apos;ll see where you diverge from the crowd.
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

function VerdictScale({
  c,
  scheme,
  position,
  communityMarker,
}: {
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  position: number;
  communityMarker: number;
}) {
  return (
    <View style={styles.scaleTrack}>
      <LinearGradient
        colors={['#3b82f6', '#10b981', '#e11d48']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.scaleGradient}
      />
      {/* community tick */}
      <View
        style={[
          styles.communityTick,
          { left: `${communityMarker * 100}%`, backgroundColor: scheme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)' },
        ]}
      />
      {/* you marker */}
      <View style={[styles.youMarker, { left: `${position * 100}%`, borderColor: c.bg }]} />
    </View>
  );
}

function Distribution({ c, rp }: { c: StatsV2ColorTokens; rp: RatingPersonality }) {
  const max = Math.max(1, ...rp.dist.you, ...rp.dist.community);
  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: c.gold }]} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.legendText, { color: c.sec }]}>
            You
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: c.bar.pastTop }]} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.legendText, { color: c.sec }]}>
            PocketStubs
          </Text>
        </View>
      </View>
      <View style={styles.bars}>
        {rp.dist.you.map((yv, i) => {
          const cv = rp.dist.community[i] ?? 0;
          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barPair}>
                <View
                  style={[styles.bar, { height: `${(yv / max) * 100}%`, backgroundColor: c.gold }]}
                />
                <View
                  style={[styles.bar, { height: `${(cv / max) * 100}%`, backgroundColor: c.bar.pastTop }]}
                />
              </View>
              <Text maxFontSizeMultiplier={1.1} style={[styles.barLabel, { color: c.faint }]}>
                {i + 1}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DivergeRowView({ r, c }: { r: DivergenceRow; c: StatsV2ColorTokens }) {
  const delta = Number((r.you - r.crowd).toFixed(1));
  return (
    <View style={[styles.divergeRow, { borderBottomColor: c.line }]}>
      <Image
        source={{ uri: getTMDBImageUrl(r.poster, 'w185') ?? undefined }}
        style={[styles.divergePoster, { backgroundColor: c.cardHi }]}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.divergeInfo}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.divergeTitle, { color: c.text }]} numberOfLines={1}>
          {r.title}
          {r.year ? <Text style={{ color: c.ter }}> ({r.year})</Text> : null}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.divergeMeta, { color: c.ter }]}>
          You <Text style={[styles.divergeMono, { color: c.gold }]}>{r.you.toFixed(1)}</Text>
          <Text style={{ color: c.faint }}> · </Text>
          Crowd <Text style={[styles.divergeMono, { color: c.sec }]}>{r.crowd.toFixed(1)}</Text>
        </Text>
      </View>
      <DeltaChip delta={delta} />
    </View>
  );
}

function AlmostThere({ c, rated }: { c: StatsV2ColorTokens; rated: number }) {
  const remaining = Math.max(0, INSIGHTS_THRESHOLD - rated);
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
        Rate {remaining} more {remaining === 1 ? 'movie' : 'movies'} and we&apos;ll show how your scores
        stack up against the PocketStubs crowd.
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
    paddingHorizontal: 2,
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
    padding: 18,
    marginBottom: 16,
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

  // ── Verdict ─────────────────────────────────────────────────────────────
  verdictTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 30,
    lineHeight: 38,
    marginTop: 6,
    marginBottom: 18,
  },
  scaleTrack: {
    height: 10,
    borderRadius: 5,
    justifyContent: 'center',
  },
  scaleGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 5,
  },
  communityTick: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
  },
  youMarker: {
    position: 'absolute',
    top: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 3,
    marginLeft: -9,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  scaleLabel: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11,
    lineHeight: 14,
  },
  blurb: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 14,
  },

  // ── The numbers grid ────────────────────────────────────────────────────
  numbersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  numberCell: {
    width: '50%',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  cellRight: {
    borderRightWidth: 1,
  },
  cellBottom: {
    borderBottomWidth: 1,
  },
  numberLabel: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  numberValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  numberValue: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 24,
    lineHeight: 26,
    marginTop: 4,
  },

  // ── Delta chip ──────────────────────────────────────────────────────────
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  deltaChipText: {
    fontFamily: Fonts.mono.bold,
    fontSize: 11.5,
    lineHeight: 15,
  },

  // ── Distribution ────────────────────────────────────────────────────────
  distCard: {
    padding: 16,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11.5,
    lineHeight: 15,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 92,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    height: 70,
    width: '100%',
  },
  bar: {
    width: '42%',
    minHeight: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  barLabel: {
    fontFamily: Fonts.mono.regular,
    fontSize: 9,
    lineHeight: 12,
  },

  // ── Divergence ──────────────────────────────────────────────────────────
  divergeHeading: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 18,
    lineHeight: 23,
    marginHorizontal: 2,
    marginTop: 4,
  },
  divergeSub: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginHorizontal: 2,
    marginTop: 4,
    marginBottom: 12,
  },
  divergeGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 2,
    marginBottom: 2,
  },
  divergeGroupSpaced: {
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divergeGroupText: {
    fontFamily: Fonts.inter.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  divergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  divergePoster: {
    width: 40,
    height: 60,
    borderRadius: 6,
    flexShrink: 0,
  },
  divergeInfo: {
    flex: 1,
    minWidth: 0,
  },
  divergeTitle: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  divergeMeta: {
    fontFamily: Fonts.inter.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  divergeMono: {
    fontFamily: Fonts.mono.bold,
    fontSize: 12,
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

  // ── Gated overlay ───────────────────────────────────────────────────────
  gatedWrap: {
    position: 'relative',
  },
  gatedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  lockPillText: {
    fontFamily: Fonts.inter.bold,
    fontSize: 13,
    lineHeight: 16,
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
