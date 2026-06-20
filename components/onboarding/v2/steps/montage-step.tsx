import { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import type { StepProps } from '@/components/onboarding/v2/types';

const C = Colors.dark;

interface Beat {
  key: string;
  ms: number;
  eyebrow: string;
  title: [string, string];
  body: string;
}

const BEATS: Beat[] = [
  {
    key: 'scan',
    ms: 6500,
    eyebrow: 'AT THE THEATER',
    title: ['Snap your ticket.', 'We do the rest.'],
    body: 'Optical recognition pulls the movie, theater, format, seat, and date. One photo, one stub, logged.',
  },
  {
    key: 'feed',
    ms: 7800,
    eyebrow: 'AFTER THE CREDITS',
    title: ['Capture', 'first takes.'],
    body: 'Your raw, unfiltered reaction the moment the credits roll — then watch it land in the feed.',
  },
  {
    key: 'stats',
    ms: 7000,
    eyebrow: "AT YEAR'S END",
    title: ['Watch your', 'year fill in.'],
    body: 'Genre splits, monthly cadence, theater visits — your taste, visualized at a glance.',
  },
];

/* ------------------------------------------------------------------ Scan */

function ScanBeat() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [y]);
  const sweep = useAnimatedStyle(() => ({ top: `${8 + y.value * 56}%`, opacity: 0.6 + (1 - y.value) * 0.4 }));

  return (
    <View style={styles.beatFill}>
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
      <Animated.View style={[styles.sweep, sweep]} />

      <Animated.View entering={FadeIn.delay(400).duration(500)} style={styles.detectedPill}>
        <View style={styles.detectedDot} />
        <ThemedText style={styles.detectedText}>DETECTED · 98% match</ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.paperTicket}>
        <ThemedText style={styles.paperHead}>AMC THEATRES</ThemedText>
        <ThemedText style={styles.paperTitle}>DUNE: PART TWO</ThemedText>
        <ThemedText style={styles.paperLine}>IMAX · 7:20 PM</ThemedText>
        <ThemedText style={styles.paperLine}>SCREEN 14 · J-12</ThemedText>
        <View style={styles.paperDivider} />
        <ThemedText style={styles.paperFoot}>03/15/26 · #71820493</ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(900).duration(600)} style={styles.detailCard}>
        <LinearGradient colors={[C.tint, C.accentHover]} style={styles.detailPoster} />
        <View style={styles.detailText}>
          <ThemedText style={styles.detailTitle}>Dune: Part Two</ThemedText>
          <ThemedText style={styles.detailMeta}>AMC EMPIRE 25 · IMAX</ThemedText>
          <ThemedText style={styles.detailMeta}>MAR 15 · 7:20 PM · ROW J-12</ThemedText>
        </View>
        <View style={styles.detailCheck}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ Feed */

const FEED_REVIEW =
  'Holy hell. Stuntwork was insane. Felt like the IMAX seat was vibrating my organs out. Zendaya carried act 3.';

const BG_POSTS = [
  { initial: 'M', name: 'marcusreels', movie: 'Poor Things', take: 'Lanthimos cooked. Emma Stone is unreal here.' },
  { initial: 'A', name: 'avaonfilm', movie: 'The Substance', take: 'Body horror of the year. Could not look away.' },
];

function FeedBeat() {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(FEED_REVIEW.slice(0, i));
      if (i >= FEED_REVIEW.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.beatPad}>
      <Animated.View entering={FadeIn.duration(400)} style={[styles.feedCard, styles.feedFocused]}>
        <View style={styles.feedHeader}>
          <View style={[styles.feedAvatar, { backgroundColor: C.tint }]}>
            <ThemedText style={styles.feedAvatarTxt}>D</ThemedText>
          </View>
          <View style={styles.flex}>
            <ThemedText style={styles.feedName}>Dune: Part Two</ThemedText>
            <ThemedText style={styles.feedSub}>FIRST TAKE · just now</ThemedText>
          </View>
          <View style={styles.youTag}>
            <ThemedText style={styles.youTagTxt}>YOU</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.feedReview}>
          {typed}
          {typed.length < FEED_REVIEW.length ? <ThemedText style={{ color: C.tint }}>|</ThemedText> : null}
        </ThemedText>
      </Animated.View>

      <View style={styles.feedBgWrap}>
        {BG_POSTS.map((p) => (
          <View key={p.name} style={styles.feedCard}>
            <View style={styles.feedHeader}>
              <View style={[styles.feedAvatar, { backgroundColor: C.backgroundSecondary }]}>
                <ThemedText style={[styles.feedAvatarTxt, { color: C.textSecondary }]}>{p.initial}</ThemedText>
              </View>
              <View style={styles.flex}>
                <ThemedText style={styles.feedName}>{p.movie}</ThemedText>
                <ThemedText style={styles.feedSub}>@{p.name} · 2h</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.feedReviewDim} numberOfLines={2}>{p.take}</ThemedText>
          </View>
        ))}
        <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <LinearGradient colors={['transparent', '#0d0d11']} style={styles.feedFade} pointerEvents="none" />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- Stats */

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CUR_YEAR = [0.45, 0.62, 0.4, 0.78, 0.55, 0.9, 0.68, 1.0, 0.72, 0.84, 0.5, 0.66];
const PREV_YEAR = [0.34, 0.46, 0.3, 0.58, 0.44, 0.66, 0.5, 0.72, 0.55, 0.6, 0.4, 0.5];
const GENRE_SPLIT = [
  { label: 'SCI-FI', pct: 38, color: '#e11d48' },
  { label: 'DRAMA', pct: 24, color: '#fbbf24' },
  { label: 'HORROR', pct: 11, color: '#10b981' },
  { label: '', pct: 16, color: '#52525b' },
  { label: '', pct: 11, color: '#3f3f46' },
];

function StatBar({ cur, prev, index }: { cur: number; prev: number; index: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(index * 70, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [h, index]);
  const curStyle = useAnimatedStyle(() => ({ height: `${h.value * cur * 100}%` }));
  const prevStyle = useAnimatedStyle(() => ({ height: `${h.value * prev * 100}%` }));
  return (
    <View style={styles.barCol}>
      <Animated.View style={[styles.ghostBar, prevStyle]} />
      <Animated.View style={[styles.curBar, curStyle]} />
    </View>
  );
}

function StatsBeat() {
  return (
    <View style={styles.beatPad}>
      <View style={styles.statsHeader}>
        <View>
          <ThemedText style={styles.statsEyebrow}>YOUR YEAR · 2025</ThemedText>
          <ThemedText style={styles.statsBig}>
            83<ThemedText style={styles.statsBigUnit}> movies</ThemedText>
          </ThemedText>
        </View>
        <View style={styles.yoyPill}>
          <ThemedText style={styles.yoyTxt}>+18% YoY</ThemedText>
        </View>
      </View>

      <View style={styles.chart}>
        {CUR_YEAR.map((c, i) => (
          <StatBar key={i} cur={c} prev={PREV_YEAR[i]} index={i} />
        ))}
      </View>
      <View style={styles.monthRow}>
        {MONTHS.map((m, i) => (
          <ThemedText key={i} style={styles.monthLabel}>{m}</ThemedText>
        ))}
      </View>

      <View style={styles.splitBar}>
        {GENRE_SPLIT.map((g, i) => (
          <View key={i} style={{ flex: g.pct, backgroundColor: g.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {GENRE_SPLIT.filter((g) => g.label).map((g) => (
          <View key={g.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: g.color }]} />
            <ThemedText style={styles.legendTxt}>{g.label} {g.pct}%</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Main */

export function MontageStep({ onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const [beat, setBeat] = useState(0);
  const isLast = beat === BEATS.length - 1;
  const b = BEATS[beat];

  // Auto-advance per-beat; STOP on the last beat (no loop).
  useEffect(() => {
    if (beat >= BEATS.length - 1) return;
    const t = setTimeout(() => setBeat((x) => x + 1), BEATS[beat].ms);
    return () => clearTimeout(t);
  }, [beat]);

  const handleCTA = () => {
    if (isLast) onNext();
    else setBeat((x) => x + 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.previewCard}>
        <Animated.View key={beat} entering={FadeIn.duration(450)} style={StyleSheet.absoluteFill}>
          {beat === 0 && <ScanBeat />}
          {beat === 1 && <FeedBeat />}
          {beat === 2 && <StatsBeat />}
        </Animated.View>
      </View>

      <Animated.View key={`copy-${beat}`} entering={FadeInUp.duration(450)} style={styles.copy}>
        <ThemedText style={styles.copyEyebrow}>{b.eyebrow}</ThemedText>
        <ThemedText style={styles.copyTitle}>{b.title[0]}</ThemedText>
        <ThemedText style={styles.copyTitle}>{b.title[1]}</ThemedText>
        <ThemedText style={styles.copyBody}>{b.body}</ThemedText>
      </Animated.View>

      <View style={styles.dots}>
        {BEATS.map((beatItem, i) => (
          <Pressable key={beatItem.key} onPress={() => setBeat(i)} hitSlop={8}>
            <View style={[styles.dot, { backgroundColor: i === beat ? C.tint : C.border, width: i === beat ? 22 : 7 }]} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <CTAButton label={isLast ? "Let's try it" : 'Next preview'} onPress={handleCTA} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.lg },
  flex: { flex: 1 },
  previewCard: {
    flex: 1,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#0d0d11',
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  beatFill: { flex: 1 },
  beatPad: { flex: 1, padding: Spacing.md },

  /* Scan */
  corner: { position: 'absolute', width: 22, height: 22, borderColor: C.tint },
  cornerTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3 },
  sweep: { position: 'absolute', left: '6%', right: '6%', height: 2, backgroundColor: C.tint },
  detectedPill: {
    position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.14)', borderColor: '#10b981', borderWidth: 1,
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  detectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  detectedText: { fontFamily: MONO_FONT, fontSize: 10, color: '#10b981', letterSpacing: 0.5 },
  paperTicket: {
    position: 'absolute', right: 18, top: '30%', width: '64%',
    backgroundColor: '#d9d5cb', borderRadius: 6, padding: 12, transform: [{ rotate: '3deg' }],
  },
  paperHead: { fontFamily: MONO_FONT, fontSize: 9, color: '#555', letterSpacing: 1 },
  paperTitle: { fontFamily: MONO_FONT, fontSize: 13, color: '#1a1a1a', marginTop: 4, letterSpacing: 0.5 },
  paperLine: { fontFamily: MONO_FONT, fontSize: 10, color: '#333', marginTop: 2 },
  paperDivider: { borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.18)', borderStyle: 'dashed', marginVertical: 6 },
  paperFoot: { fontFamily: MONO_FONT, fontSize: 9, color: '#666' },
  detailCard: {
    position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: BorderRadius.md, padding: 12,
  },
  detailPoster: { width: 38, height: 54, borderRadius: 5 },
  detailText: { flex: 1, gap: 2 },
  detailTitle: { fontFamily: Fonts.outfit.bold, fontSize: 15, color: C.text },
  detailMeta: { fontFamily: MONO_FONT, fontSize: 10, color: C.textSecondary },
  detailCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },

  /* Feed */
  feedCard: { backgroundColor: C.card, borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.sm },
  feedFocused: { borderWidth: 1, borderColor: C.tint, zIndex: 2 },
  feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  feedAvatar: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  feedAvatarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  feedName: { fontFamily: Fonts.outfit.bold, fontSize: 14, color: C.text },
  feedSub: { fontFamily: MONO_FONT, fontSize: 9, color: C.textTertiary, letterSpacing: 0.5, marginTop: 1 },
  youTag: { backgroundColor: 'rgba(225,29,72,0.15)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  youTagTxt: { fontFamily: MONO_FONT, fontSize: 9, color: C.tint, letterSpacing: 1 },
  feedReview: { fontFamily: Fonts.inter.regular, fontSize: 13, lineHeight: 19, color: C.text },
  feedReviewDim: { fontFamily: Fonts.inter.regular, fontSize: 13, lineHeight: 19, color: C.textSecondary },
  feedBgWrap: { flex: 1, position: 'relative' },
  feedFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },

  /* Stats */
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  statsEyebrow: { fontFamily: MONO_FONT, fontSize: 10, color: C.textTertiary, letterSpacing: 1.5 },
  statsBig: { fontFamily: Fonts.outfit.extrabold, fontSize: 30, color: C.text, marginTop: 2 },
  statsBigUnit: { fontFamily: Fonts.outfit.bold, fontSize: 16, color: C.tint },
  yoyPill: { backgroundColor: 'rgba(16,185,129,0.14)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  yoyTxt: { fontFamily: MONO_FONT, fontSize: 11, color: '#10b981' },
  chart: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: Spacing.sm },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', position: 'relative' },
  ghostBar: { position: 'absolute', left: 2, right: -2, bottom: 0, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)' },
  curBar: { width: '100%', borderRadius: 2, backgroundColor: C.tint, minHeight: 3 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  monthLabel: { flex: 1, textAlign: 'center', fontFamily: MONO_FONT, fontSize: 9, color: C.textTertiary },
  splitBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: Spacing.md },
  legend: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendTxt: { fontFamily: MONO_FONT, fontSize: 10, color: C.textSecondary },

  /* copy + chrome */
  copy: { marginTop: Spacing.lg },
  copyEyebrow: { fontFamily: MONO_FONT, fontSize: 11, color: C.tint, letterSpacing: 1.5, marginBottom: 6 },
  copyTitle: { fontFamily: Fonts.outfit.extrabold, fontSize: 26, lineHeight: 30, color: C.text, letterSpacing: -0.5 },
  copyBody: { fontFamily: Fonts.inter.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary, marginTop: Spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.lg },
  dot: { height: 7, borderRadius: 4 },
  footer: { paddingTop: Spacing.md },
});
