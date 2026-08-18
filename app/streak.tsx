/**
 * PS-15 · the streak screen (v1).
 *
 * A pixel build of the founder's signed-off mock — docs/design/ps15-streak/
 * acceptance-mock.html card 1d, with the camera from design_handoff_streak_camera/.
 * Top to bottom: header, PERSONAL/FRIENDS tabs, the camera hero + numeral,
 * the message card, extend pills while today is blank, the month calendar with
 * run pills, and the honest footnote.
 *
 * Gated on `streak_spine` (founder-only) like every other streak surface — the
 * route renders nothing and bounces home when the flag is off.
 *
 * v1 is static: reel rotation, the state-transition fade, month paging and the
 * FRIENDS tab are later rungs of the ladder.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, {
  Defs,
  FeDropShadow,
  Filter,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { cameraPalette, useStreakColors, type StreakColorTokens } from '@/constants/streak-theme';
import { useStreakSpineEnabled } from '@/hooks/use-feature-flag';
import { useStreakCard } from '@/hooks/use-streak-card';
import { MILESTONES } from '@/lib/streak-logic';
import {
  BEAM_HEIGHT,
  BEAM_RIGHT_INSET,
  CAMERA_HEIGHT,
  CAMERA_WIDTH,
  HERO_HEIGHT,
  StreakBeam,
  StreakCamera,
  StreakStageWash,
} from '@/components/streak/streak-camera';
import {
  buildCalendar,
  deriveCoveredDays,
  deriveHeroState,
  deriveMilestoneDays,
  monthLabel,
  shiftDate,
  streakMessage,
  type StreakCalendarDay,
  type StreakHeroState,
} from '@/lib/streak-view';

const SCREEN_PAD = 20;
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL_HEIGHT = 36;
const DISC = 34;

/** Where each extend pill lands. The mock's mono sub-labels are the routing spec. */
const ROUTES = {
  Home: '/(tabs)',
  Scan: '/(tabs)/scanner',
  Feed: '/(tabs)/feed',
} as const;

type Destination = keyof typeof ROUTES;

export default function StreakScreen() {
  const enabled = useStreakSpineEnabled();
  const { c, isDark } = useStreakColors();
  const { width: screenWidth } = useWindowDimensions();
  const { card } = useStreakCard();

  // __DEV__ QA harness: long-pressing the title cycles the four states so all
  // of them can be screenshot against the mock without seeding the database.
  // Impossible to reach in a production build — the whole block compiles out.
  const [devState, setDevState] = useState(0);
  const cycleDevState = useCallback(() => {
    if (!__DEV__) return;
    setDevState((n) => (n + 1) % (DEV_FIXTURES.length + 1));
  }, []);

  // The flag fails closed everywhere else; the route has to as well, or a
  // deep link would open a screen the user isn't in the rollout for.
  useEffect(() => {
    if (!enabled) router.replace('/(tabs)');
  }, [enabled]);

  const view = useMemo(() => {
    if (__DEV__ && devState > 0) return DEV_FIXTURES[devState - 1];
    if (!card) return null;
    return viewModel(card);
  }, [card, devState]);

  if (!enabled || !view) {
    return <View style={[styles.flex, { backgroundColor: c.bg }]} />;
  }

  const palette = cameraPalette(view.state, isDark);
  const lit = view.state !== 'idle';
  const beamWidth = Math.max(0, screenWidth - BEAM_RIGHT_INSET);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 1 · header */}
        <View style={styles.bar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Path
                d="M5 5 L15 15 M15 5 L5 15"
                stroke={c.ter}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Pressable>
          <Text
            maxFontSizeMultiplier={1.2}
            onLongPress={cycleDevState}
            suppressHighlighting
            style={[styles.title, { color: c.text }]}
          >
            Streak
          </Text>
          <View style={styles.close} />
        </View>

        {/* 2 · tabs — FRIENDS is a later rung, so it is rendered and inert */}
        <View
          style={[styles.tabs, { backgroundColor: c.tabTrough, borderColor: c.line }]}
          accessibilityRole="tablist"
        >
          <View style={[styles.tab, { backgroundColor: c.tabActive }]}>
            <Text maxFontSizeMultiplier={1.1} style={[styles.tabLabel, { color: c.text }]}>
              PERSONAL
            </Text>
          </View>
          <View style={styles.tab}>
            <Text maxFontSizeMultiplier={1.1} style={[styles.tabLabel, { color: c.tabIdle }]}>
              FRIENDS
            </Text>
            <View style={[styles.soon, { borderColor: c.soonLine }]}>
              <Text maxFontSizeMultiplier={1.1} style={[styles.soonLabel, { color: c.muted }]}>
                SOON
              </Text>
            </View>
          </View>
        </View>

        {/* 3 · the hero. The stage wrapper is present in every state so the
            region never changes layout; the warm wash paints only under a lit
            hero in light mode, and is clipped to the hero's own bounds. */}
        <View style={styles.hero}>
          {!isDark && lit && (
            <View style={StyleSheet.absoluteFill}>
              <StreakStageWash width={screenWidth} height={HERO_HEIGHT} state={view.state} />
            </View>
          )}
          {lit && (
            <View style={styles.beam}>
              <StreakBeam width={beamWidth} palette={palette} isDark={isDark} />
            </View>
          )}
          <View style={styles.camera}>
            <StreakCamera palette={palette} lit={lit} celebrate={view.state === 'milestone'} />
          </View>
          <HeroNumber view={view} c={c} isDark={isDark} screenWidth={screenWidth} />
        </View>

        {/* 3b · message card */}
        <View style={[styles.msg, { backgroundColor: c.card, borderColor: c.line }]}>
          <Text maxFontSizeMultiplier={1.4} style={[styles.msgText, { color: c.sec }]}>
            <Text style={[styles.msgLead, { color: c.text }]}>{view.message.lead}</Text>
            {view.message.rest}
          </Text>
        </View>

        {/* 3c · extend pills — only while today is still blank */}
        {view.state === 'idle' && (
          <View style={styles.acts}>
            {(view.streak === 0
              ? ([
                  { label: 'Rate a film', dest: 'Home' as Destination, go: true },
                  { label: 'Scan ticket', dest: 'Scan' as Destination, go: false },
                  { label: 'First Take', dest: 'Home' as Destination, go: false },
                ])
              : ([
                  { label: 'Scan ticket', dest: 'Scan' as Destination, go: true },
                  { label: 'First Take', dest: 'Home' as Destination, go: false },
                  { label: 'Comment', dest: 'Feed' as Destination, go: false },
                ])
            ).map((a) => (
              <ExtendPill key={a.label} {...a} c={c} />
            ))}
          </View>
        )}

        {/* 4 · month nav — rendered but inert; paging is a later rung */}
        <View style={styles.monthBar}>
          <NavCircle direction="prev" c={c} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.monthName, { color: c.text }]}>
            {view.monthLabel}
          </Text>
          <NavCircle direction="next" c={c} />
        </View>

        {/* 5 · stat chips */}
        <View style={styles.chips}>
          <StatChip value={view.daysActive} label={`DAY${view.daysActive === 1 ? '' : 'S'} ACTIVE`} c={c} />
          {view.rainChecksUsed > 0 ? (
            <StatChip
              value={view.rainChecksUsed}
              label={`RAIN CHECK${view.rainChecksUsed === 1 ? '' : 'S'} USED`}
              c={c}
              gold
            />
          ) : (
            <StatChip
              value={view.rainChecks}
              label={`RAIN CHECK${view.rainChecks === 1 ? '' : 'S'} BANKED`}
              c={c}
            />
          )}
        </View>

        {/* 6 · calendar */}
        <View style={styles.dow}>
          {DOW.map((d, i) => (
            <Text
              key={`${d}-${i}`}
              maxFontSizeMultiplier={1.1}
              style={[styles.dowLabel, { color: c.muted }]}
            >
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.cal}>
          {view.weeks.map((week, wi) => (
            <View key={wi} style={styles.calRow}>
              {/* run pills sit under the numerals, one capsule per run */}
              {week.runs.map((run) => (
                <View
                  key={run.start}
                  pointerEvents="none"
                  style={[
                    styles.runPill,
                    {
                      backgroundColor: c.runBg,
                      left: `${(run.start / 7) * 100}%`,
                      width: `${(run.span / 7) * 100}%`,
                    },
                  ]}
                />
              ))}
              {week.days.map((day, di) => (
                <CalendarCell key={di} day={day} c={c} isDark={isDark} />
              ))}
            </View>
          ))}
        </View>

        {/* 7 · footnote */}
        <Text maxFontSizeMultiplier={1.2} style={[styles.footnote, { color: c.faint }]}>
          {view.footnote}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * The numeral. Dark lit is white under a warm shadow; light lit is near-black
 * ink under a warm glow hugging the glyphs. Milestone is gradient ink in both
 * themes — drawn as SVG text with a gradient fill, because the MaskedView the
 * handoff suggests would need a native module (and therefore a store build) for
 * one numeral. The wrapper's celebration glow rides the same SVG filter.
 */
function HeroNumber({
  view,
  c,
  isDark,
  screenWidth,
}: {
  view: StreakView;
  c: StreakColorTokens;
  isDark: boolean;
  screenWidth: number;
}) {
  const mile = view.state === 'milestone';
  const lit = view.state !== 'idle';
  const label = String(view.streak);

  return (
    <View
      style={[
        styles.heroNum,
        // Below ~370pt the milestone chip would sit on the lens barrel, where
        // gold on gold means it is simply not there. Ceiling the block at
        // everything left of the lens less 20pt of air and let the sub row
        // wrap instead. Milestone-only — the only state with two items there.
        mile && { maxWidth: screenWidth - 223 },
      ]}
      pointerEvents="none"
    >
      {mile ? (
        <GradientNumeral label={label} isDark={isDark} />
      ) : (
        <Text
          maxFontSizeMultiplier={1}
          allowFontScaling={false}
          style={[
            styles.num,
            lit
              ? isDark
                ? {
                    color: '#ffffff',
                    textShadowColor: 'rgba(255,205,160,0.55)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 34,
                  }
                : {
                    color: c.text,
                    textShadowColor: 'rgba(255,150,60,0.45)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 16,
                  }
              : { color: '#a1a1aa' },
          ]}
        >
          {label}
        </Text>
      )}
      <View style={[styles.unitRow, mile && styles.unitRowWrap]}>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[styles.unit, { color: lit ? c.sec : c.muted }]}
        >
          day streak
        </Text>
        {mile && (
          <View
            style={[
              styles.mileChip,
              isDark
                ? { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.1)' }
                : { borderColor: 'rgba(180,83,9,0.55)', backgroundColor: 'transparent' },
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.1}
              style={[styles.mileChipLabel, { color: isDark ? c.gold : '#b45309' }]}
            >
              MILESTONE
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const NUM_FONT_SIZE = 88;
const NUM_LINE_HEIGHT = 96;
/**
 * Where RN puts the baseline inside an 88/96 Outfit line box, and how tall the
 * digits are once it does — both measured off the device, so the milestone
 * numeral lands on the same pixels as the plain one instead of a few points
 * lower. The gradient is mapped to that cap band, not to the box: spread over
 * the whole box the white end would fall above the glyphs and the digits would
 * read uniformly gold.
 */
const NUM_BASELINE = 81;
const NUM_CAP_TOP = NUM_BASELINE - 63;

function GradientNumeral({ label, isDark }: { label: string; isDark: boolean }) {
  // Wide enough for three digits at 88px; the text is left-anchored so extra
  // width costs nothing and never clips the celebration glow.
  const width = 230;
  const height = NUM_LINE_HEIGHT;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient
          id="numInk"
          x1="0"
          y1={NUM_CAP_TOP}
          x2="0"
          y2={NUM_BASELINE}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={isDark ? '#ffffff' : '#c26208'} />
          <Stop offset="1" stopColor={isDark ? '#fde68a' : '#e9910c'} />
        </LinearGradient>
        <Filter id="numGlow" x="-40%" y="-40%" width="180%" height="180%">
          <FeDropShadow
            dx="0"
            dy="0"
            stdDeviation={isDark ? '14' : '8'}
            floodColor={isDark ? 'rgba(251,191,36,0.4)' : 'rgba(245,158,11,0.30)'}
            floodOpacity="1"
          />
        </Filter>
      </Defs>
      <G filter="url(#numGlow)">
        <SvgText
          x="0"
          y={NUM_BASELINE}
          fill="url(#numInk)"
          fontFamily={Fonts.outfit.extrabold}
          fontSize={NUM_FONT_SIZE}
        >
          {label}
        </SvgText>
      </G>
    </Svg>
  );
}

function ExtendPill({
  label,
  dest,
  go,
  c,
}: {
  label: string;
  dest: Destination;
  go: boolean;
  c: StreakColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} — go to ${dest}`}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Dismiss the streak screen on the way out — the user came here to go
        // do the thing, not to come back to a stale count.
        router.back();
        router.push(ROUTES[dest] as never);
      }}
      style={({ pressed }) => [
        styles.act,
        { borderColor: go ? c.tint : c.line, backgroundColor: go ? c.tint : 'transparent' },
        pressed && styles.pressed,
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={[styles.actLabel, { color: go ? '#ffffff' : c.text }]}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.1}
        numberOfLines={1}
        style={[styles.actDest, { color: go ? 'rgba(255,255,255,0.74)' : c.ter }]}
      >
        → {dest.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function NavCircle({ direction, c }: { direction: 'prev' | 'next'; c: StreakColorTokens }) {
  return (
    <View style={[styles.nav, { borderColor: c.line }]}>
      <Svg width={14} height={14} viewBox="0 0 14 14">
        <Path
          d={direction === 'prev' ? 'M8.5 3 L5 7 L8.5 11' : 'M5.5 3 L9 7 L5.5 11'}
          stroke={c.ter}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

function StatChip({
  value,
  label,
  c,
  gold,
}: {
  value: number;
  label: string;
  c: StreakColorTokens;
  gold?: boolean;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: c.chip, borderColor: c.line }]}>
      <Text maxFontSizeMultiplier={1.1} style={[styles.chipValue, { color: gold ? c.gold : c.text }]}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.chipLabel, { color: c.ter }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One calendar cell. A milestone day is a gold disc (it doubles as today's
 * marker when the two coincide — gold wins); today inside a live run is a solid
 * rose disc that terminates the pill; an unlogged today keeps a ring outline so
 * it stays findable; a rain-checked day keeps its pill and swaps the numeral
 * for the cloud, which is the honest picture of what happened.
 */
function CalendarCell({
  day,
  c,
  isDark,
}: {
  day: StreakCalendarDay;
  c: StreakColorTokens;
  isDark: boolean;
}) {
  if (day.day === null) return <View style={styles.calCell} />;

  if (day.milestone) {
    return (
      <View style={styles.calCell}>
        <View style={[styles.discRing, { backgroundColor: 'rgba(251,191,36,0.55)' }]}>
          <View style={[styles.discGap, { backgroundColor: c.bg }]}>
            <View style={styles.disc}>
              <Svg width={DISC} height={DISC} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="mileDisc" x1="0" y1="0" x2="0" y2={DISC} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#fbbf24" />
                    <Stop offset="1" stopColor="#f59e0b" />
                  </LinearGradient>
                </Defs>
                <Path d={discPath()} fill="url(#mileDisc)" />
              </Svg>
              <Text maxFontSizeMultiplier={1} style={styles.discLabel}>
                {day.day}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (day.isToday && day.active) {
    return (
      <View style={styles.calCell}>
        <View style={[styles.discRing, { backgroundColor: 'rgba(225,29,72,0.55)' }]}>
          <View style={[styles.discGap, { backgroundColor: c.bg }]}>
            <View style={[styles.disc, { backgroundColor: c.tint }]}>
              <Text maxFontSizeMultiplier={1} style={[styles.discLabel, { color: '#ffffff' }]}>
                {day.day}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (day.covered) {
    return (
      <View style={styles.calCell}>
        <RainGlyph color={c.gold} />
      </View>
    );
  }

  const todayRing = day.isToday
    ? { borderWidth: 1.75, borderColor: 'rgba(225,29,72,0.62)', borderRadius: 18 }
    : null;
  const ink = day.active ? c.runInk : c.offInk;
  const dim = day.future ? 0.34 : day.unknown ? 0.5 : 1;

  return (
    <View style={[styles.calCell, todayRing]}>
      <Text
        maxFontSizeMultiplier={1}
        style={[
          styles.dayLabel,
          {
            color: day.isToday && !day.active ? c.text : ink,
            opacity: dim,
            fontFamily: day.active || day.isToday ? Fonts.inter.semibold : Fonts.inter.medium,
          },
        ]}
      >
        {day.day}
      </Text>
    </View>
  );
}

/** A rain check reads as a rainy day, not a ticket: cloud + three drops. */
function RainGlyph({ color }: { color: string }) {
  const w = 15;
  return (
    <Svg width={w} height={Math.round((w * 30) / 24)} viewBox="0 0 24 30">
      <Path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill={color}
      />
      <G stroke={color} strokeWidth={2.1} strokeLinecap="round" opacity={0.92}>
        <Path d="M7.4 22.6 6.1 26.7" />
        <Path d="M12.4 22.6 11.1 26.7" />
        <Path d="M17.4 22.6 16.1 26.7" />
      </G>
    </Svg>
  );
}

/** A DISC-diameter circle as a path, so it can carry a gradient fill. */
function discPath(): string {
  const r = DISC / 2;
  return `M0 ${r}a${r} ${r} 0 1 0 ${DISC} 0a${r} ${r} 0 1 0 -${DISC} 0`;
}

/* ------------------------------------------------------------- view model */

interface StreakView {
  state: StreakHeroState;
  streak: number;
  message: ReturnType<typeof streakMessage>;
  monthLabel: string;
  daysActive: number;
  rainChecks: number;
  rainChecksUsed: number;
  weeks: ReturnType<typeof buildCalendar>;
  footnote: string;
}

function viewModel(card: NonNullable<ReturnType<typeof useStreakCard>['card']>): StreakView {
  const { snapshot, activityDays, localDate, windowStart, effectiveStreak } = card;
  const activeDates = new Set(activityDays.map((d) => d.local_date));
  const covered = deriveCoveredDays(snapshot, activeDates, windowStart);
  const milestoneDays = deriveMilestoneDays(snapshot, activeDates, covered, windowStart);
  const state = deriveHeroState(effectiveStreak, activeDates.has(localDate));
  const weeks = buildCalendar({ today: localDate, activeDates, covered, milestoneDays, windowStart });

  const monthPrefix = localDate.slice(0, 7);
  const daysActive = [...activeDates].filter((d) => d.startsWith(monthPrefix)).length;

  return {
    state,
    streak: effectiveStreak,
    message: streakMessage(effectiveStreak, state),
    monthLabel: monthLabel(localDate),
    daysActive,
    rainChecks: snapshot.rainChecks,
    rainChecksUsed: snapshot.rainChecksUsed,
    weeks,
    footnote: footnoteFor(localDate, windowStart, effectiveStreak),
  };
}

/**
 * The handoff's footnote read "LAST 30 DAYS · MILESTONE EVERY 30". Ours tells
 * the truth about what was actually fetched and about the shipped thresholds,
 * and admits when the run predates the window (the DB has no rows before
 * 2026-07-07 and the ADR forbids reconstructing them).
 */
function footnoteFor(today: string, windowStart: string, streak: number): string {
  let span = 1;
  for (let d = windowStart; d < today; d = shiftDate(d, 1)) span += 1;
  const earlier = streak > span ? ' · this run started earlier' : '';
  return `Last ${span} days fetched · milestones at ${MILESTONES.join(', ')}${earlier}`;
}

/* --------------------------------------------------------- __DEV__ harness */

/**
 * The four states the mock is signed off in, so screenshot QA can walk them
 * without seeding rows. Long-press "Streak" to cycle: live → extended today →
 * pending → day 0 → milestone → live. Dead code in production (`__DEV__`).
 */
const DEV_FIXTURES: StreakView[] = __DEV__ ? buildDevFixtures() : [];

function buildDevFixtures(): StreakView[] {
  const today = new Date().toLocaleDateString('en-CA');
  const monthStart = `${today.slice(0, 7)}-01`;
  const dom = Number(today.slice(8, 10));

  const make = (opts: {
    streak: number;
    litToday: boolean;
    activeSpanDays: number;
    coveredOffset?: number;
    rainChecks: number;
    rainChecksUsed: number;
    milestone?: boolean;
  }): StreakView => {
    const last = opts.litToday ? today : shiftDate(today, -1);
    const active = new Set<string>();
    for (let i = 0; i < opts.activeSpanDays; i++) {
      const d = shiftDate(last, -i);
      if (d >= monthStart) active.add(d);
    }
    const covered = new Set<string>();
    if (opts.coveredOffset != null) {
      const d = shiftDate(last, -opts.coveredOffset);
      active.delete(d);
      if (d >= monthStart) covered.add(d);
    }
    const milestoneDays = new Set<string>(opts.milestone ? [last] : []);
    const state = deriveHeroState(opts.streak, opts.litToday);
    return {
      state,
      streak: opts.streak,
      message: streakMessage(opts.streak, state),
      monthLabel: monthLabel(today),
      daysActive: active.size,
      rainChecks: opts.rainChecks,
      rainChecksUsed: opts.rainChecksUsed,
      weeks: buildCalendar({
        today,
        activeDates: active,
        covered,
        milestoneDays,
        windowStart: monthStart,
      }),
      footnote: footnoteFor(today, monthStart, opts.streak),
    };
  };

  return [
    make({ streak: 12, litToday: true, activeSpanDays: Math.min(12, dom), rainChecks: 1, rainChecksUsed: 0 }),
    make({ streak: 12, litToday: false, activeSpanDays: Math.min(12, dom - 1), rainChecks: 1, rainChecksUsed: 0 }),
    make({ streak: 0, litToday: false, activeSpanDays: 0, rainChecks: 0, rainChecksUsed: 0 }),
    make({
      streak: 30,
      litToday: true,
      activeSpanDays: Math.min(30, dom),
      coveredOffset: 4,
      rainChecks: 1,
      rainChecksUsed: 1,
      milestone: true,
    }),
  ];
}

/* -------------------------------------------------------------- stylesheet */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 26 },
  pressed: { opacity: 0.6 },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PAD,
    paddingTop: SCREEN_PAD,
    paddingBottom: 4,
  },
  close: { width: 24, height: 24, alignItems: 'flex-start', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.outfit.bold,
    fontSize: 19,
    lineHeight: 24,
  },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: SCREEN_PAD,
    marginTop: 14,
    height: 46,
    padding: 3,
    borderWidth: 1,
    borderRadius: 23,
  },
  tab: {
    flex: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  tabLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.89, // .18em
  },
  soon: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 2,
  },
  soonLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.9, // .12em
  },

  hero: { height: HERO_HEIGHT, overflow: 'hidden', justifyContent: 'center' },
  beam: {
    position: 'absolute',
    left: 0,
    // The beam's narrow end sits on the lens axis: container centre + 17.
    top: (HERO_HEIGHT - BEAM_HEIGHT) / 2 + 17,
    height: BEAM_HEIGHT,
  },
  camera: {
    position: 'absolute',
    right: 14,
    top: (HERO_HEIGHT - CAMERA_HEIGHT) / 2,
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT,
  },
  heroNum: { position: 'absolute', left: 24, gap: 4 },
  num: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: NUM_FONT_SIZE,
    // Outfit ExtraBold clips its own ascenders at line-height 1 in RN; the mock
    // is a browser, which doesn't.
    lineHeight: NUM_LINE_HEIGHT,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  unitRowWrap: { flexWrap: 'wrap', rowGap: 5 },
  unit: { fontFamily: Fonts.inter.regular, fontSize: 15, lineHeight: 20 },
  mileChip: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  mileChipLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.96, // .12em
  },

  msg: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  msgText: { fontFamily: Fonts.inter.regular, fontSize: 13.5, lineHeight: 20 },
  msgLead: { fontFamily: Fonts.inter.semibold },

  acts: { flexDirection: 'row', gap: 7, marginHorizontal: SCREEN_PAD, marginTop: 10 },
  act: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 13,
    paddingTop: 8,
    paddingBottom: 9,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actLabel: { fontFamily: Fonts.inter.regular, fontSize: 13, lineHeight: 15 },
  actDest: {
    fontFamily: Fonts.mono.regular,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.8, // .1em
  },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SCREEN_PAD,
    marginTop: 24,
  },
  monthName: { fontFamily: Fonts.outfit.bold, fontSize: 17, lineHeight: 22 },
  nav: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4, // paging is a later rung — rendered, disabled
  },

  chips: { flexDirection: 'row', gap: 10, marginHorizontal: SCREEN_PAD, marginTop: 14 },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  chipValue: { fontFamily: Fonts.outfit.bold, fontSize: 13.5, lineHeight: 16 },
  chipLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 1.14, // .12em
  },

  dow: { flexDirection: 'row', marginHorizontal: SCREEN_PAD, marginTop: 18 },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.mono.medium,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 0.95, // .1em
  },
  cal: { marginHorizontal: SCREEN_PAD, marginTop: 10, gap: 6 },
  calRow: { flexDirection: 'row', height: CELL_HEIGHT },
  runPill: {
    position: 'absolute',
    top: 0,
    height: CELL_HEIGHT,
    borderRadius: 18,
  },
  calCell: { flex: 1, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 13, lineHeight: 17 },
  discRing: {
    width: DISC + 7,
    height: DISC + 7,
    borderRadius: (DISC + 7) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discGap: {
    width: DISC + 4,
    height: DISC + 4,
    borderRadius: (DISC + 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  discLabel: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 13.5,
    lineHeight: 17,
    color: '#451a03',
  },

  footnote: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: Fonts.mono.regular,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 1.26, // .14em
    textTransform: 'uppercase',
  },
});
