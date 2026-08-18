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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { analytics } from '@/lib/analytics';
import { cameraPalette, useStreakColors, type StreakColorTokens } from '@/constants/streak-theme';
import { useStreakSpineGate } from '@/hooks/use-feature-flag';
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
  calendarDayLabel,
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
  const { enabled, resolved } = useStreakSpineGate();
  const { c, isDark } = useStreakColors();
  const { width: screenWidth } = useWindowDimensions();
  const { card, loaded, reload } = useStreakCard();
  const { from } = useLocalSearchParams<{ from?: string }>();

  // __DEV__ QA harness: long-pressing the title cycles the four states so all
  // of them can be screenshot against the mock without seeding the database.
  // `__DEV__` is a build-time constant, so a release bundle keeps the fixture
  // builder as unreachable dead code and never attaches the handler.
  const [devState, setDevState] = useState(0);
  const cycleDevState = useCallback(() => {
    setDevState((n) => (n + 1) % (DEV_FIXTURES.length + 1));
  }, []);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  // The flag fails closed everywhere else and the route has to as well — but
  // only once PostHog has ANSWERED. A cold deep link lands before flags
  // resolve, and redirecting on the unresolved `false` would bounce a user who
  // is in the rollout straight back home, permanently.
  useEffect(() => {
    if (resolved && !enabled) router.replace('/(tabs)');
  }, [resolved, enabled]);

  const view = useMemo(() => {
    if (__DEV__ && devState > 0) return DEV_FIXTURES[devState - 1];
    if (!card) return null;
    return viewModel(card);
  }, [card, devState]);

  // One view event per mount, once we know which state the user actually saw.
  const tracked = useRef(false);
  useEffect(() => {
    if (!view || tracked.current) return;
    tracked.current = true;
    analytics.track('streak:screen_view', {
      state: view.state,
      streak: view.streak,
      entry_point: from ?? 'direct',
    });
  }, [view, from]);

  // The redirect above is already running; paint the ground, not a flash of UI.
  if (resolved && !enabled) {
    return <View style={[styles.flex, { backgroundColor: c.bg }]} />;
  }

  const palette = view ? cameraPalette(view.state, isDark) : null;
  const lit = view ? view.state !== 'idle' : false;
  const beamWidth = Math.max(0, screenWidth - BEAM_RIGHT_INSET);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 1 · header. Rendered in every phase — the ✕ is the only way out of a
            modal route, so it must exist before the data does. */}
        <View style={styles.bar}>
          <Pressable
            onPress={dismiss}
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
            onLongPress={__DEV__ ? cycleDevState : undefined}
            suppressHighlighting
            style={[styles.title, { color: c.text }]}
          >
            Streak
          </Text>
          <View style={styles.close} />
        </View>

        {/* Nothing below the header until the flag has answered. The header is
            unconditional because the ✕ is the only way out of a modal route,
            but a deep-linker who is NOT in the rollout must not be shown the
            feature's chrome for the ~5s the gate can take to resolve. */}
        {!resolved ? null : !view ? (
          loaded ? (
            <StreakLoadFailed c={c} onRetry={reload} />
          ) : (
            <StreakSkeleton c={c} />
          )
        ) : (
          <>
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
              <StreakBeam width={beamWidth} palette={palette!} isDark={isDark} />
            </View>
          )}
          <View style={styles.camera}>
            <StreakCamera palette={palette!} lit={lit} celebrate={view.state === 'milestone'} />
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
              <ExtendPill key={a.label} {...a} c={c} state={view.state} />
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
                <CalendarCell key={di} day={day} c={c} monthLabel={view.monthLabel} />
              ))}
            </View>
          ))}
        </View>

        {/* 7 · footnote */}
        <Text maxFontSizeMultiplier={1.2} style={[styles.footnote, { color: c.faint }]}>
          {view.footnote}
        </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * What the screen shows while the card is in flight. The tabs are static
 * chrome, so they render for real; the hero and message card hold their
 * finished dimensions as empty ground, which keeps the header from jumping
 * when the data lands.
 */
function StreakSkeleton({ c }: { c: StreakColorTokens }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading your streak">
      <View style={[styles.tabs, { backgroundColor: c.tabTrough, borderColor: c.line }]}>
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
      <View style={styles.hero} />
      <View
        style={[styles.msg, styles.skeletonMsg, { backgroundColor: c.card, borderColor: c.line }]}
      />
    </View>
  );
}

/** Loaded, but there is no card — signed out, offline, or the query errored. */
function StreakLoadFailed({ c, onRetry }: { c: StreakColorTokens; onRetry: () => void }) {
  return (
    <View style={styles.failed}>
      <Text maxFontSizeMultiplier={1.4} style={[styles.failedText, { color: c.sec }]}>
        We couldn’t load your streak just now.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try loading your streak again"
        style={({ pressed }) => [
          styles.retry,
          { borderColor: c.tint, backgroundColor: c.tint },
          pressed && styles.pressed,
        ]}
      >
        <Text maxFontSizeMultiplier={1.2} style={styles.retryLabel}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The numeral. Dark lit is white under a warm shadow; light lit is near-black
 * ink under a warm glow hugging the glyphs. Milestone is gradient ink in both
 * themes — drawn as SVG text with a gradient fill, because the MaskedView the
 * handoff suggests would need a native module (and therefore a store build) for
 * one numeral. The wide half of the bloom is `NumeralHalo`, not a shadow.
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
      {lit && <NumeralHalo label={label} mile={mile} isDark={isDark} />}
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
                // The whole bloom is `NumeralHalo`. A `textShadow` under it
                // read a third brighter on iOS than on Android at the glyph
                // edge — the same divergence in miniature — and the halo
                // covers that band on its own.
                ? { color: '#ffffff' }
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
 * lower. (It does on Android. On iOS the plain numeral still sits 7.7pt higher
 * than this — see `NUM_TEXT_RISE`. Closing that means moving a signed-off
 * composition, so it is flagged, not fixed.) The gradient is mapped to that cap
 * band, not to the box: spread over the whole box the white end would fall
 * above the glyphs and the digits would read uniformly gold.
 */
const NUM_BASELINE = 81;
const NUM_CAP_TOP = NUM_BASELINE - 63;
/** Outfit ExtraBold's digit advance at 88px, measured off the device. */
const NUM_DIGIT_ADVANCE = 52;
/**
 * How much higher the plain numeral's glyphs sit than the milestone numeral's.
 *
 * The two are drawn by different engines: `Text` lets RN place an 88/96 Outfit
 * line, and `GradientNumeral` plants a baseline at a measured constant. Android
 * zeroes the font's top padding (`includeFontPadding: false`) and the two land
 * within a point of each other; iOS has no such switch and puts the Text 7.7pt
 * higher. Measured on both, in both states. The bloom is identical geometry
 * either way — this only moves what it is centred on.
 */
const NUM_TEXT_RISE = Platform.OS === 'ios' ? 7.7 : 0;

/**
 * The wide half of the numeral's bloom, painted as geometry.
 *
 * The mock lights the numeral with two stacked shadows — a 34px one on the
 * glyphs and a 90px one behind them — and neither of RN's two ways of saying
 * that survives the crossing:
 *
 *  · `Text` takes ONE `textShadow`, so the wide one was simply dropped, and
 *    `textShadowRadius` is a tighter gaussian than a CSS blur of the same
 *    number — tighter again on Android than on iOS.
 *  · The milestone numeral's `FeDropShadow` lived inside a 230×96 `<Svg>`.
 *    Android clips a filter at its box (18px of headroom above the glyphs, none
 *    to the left, so: no halo at all); iOS bleeds past it instead, blooming
 *    wider than the mock.
 *
 * A circle under a radial gradient has no filter and no clip, so it lands on
 * the same pixels on both platforms, and it carries the whole bloom — a
 * `textShadow` left under it for the tight core read a third brighter on iOS
 * than on Android at the glyph edge, which is the same divergence in miniature.
 *
 * Circular, not elliptical, on purpose: given `rx` ≠ `ry` Android scales the
 * gradient by `rx` on both axes while iOS honours the ellipse, which would have
 * reintroduced the very divergence this replaces. With one radius there is
 * nothing left to disagree about.
 *
 * The stops are fitted to the mock's own falloff — luminance above #09090b,
 * sampled straight up from the glyph top, the one direction clear of the beam,
 * the sub-label and the camera. Light mode is deliberately NOT given the wide
 * halo: its spec is a 16px glow hugging the glyphs, and round 9 rejected the
 * wide smear by name.
 */
type HaloSpec = {
  rgb: string;
  /** Radius from the glyph centre, in points. */
  r: number;
  stops: readonly (readonly [number, number])[];
};

function haloSpec(mile: boolean, isDark: boolean): HaloSpec | null {
  if (isDark) {
    return mile
      ? {
          rgb: '251,191,36',
          r: 105,
          stops: [
            [0, 0.105],
            [0.35, 0.092],
            [0.4, 0.078],
            [0.45, 0.06],
            [0.5, 0.054],
            [0.59, 0.033],
            [0.69, 0.017],
            [0.79, 0.007],
            [1, 0],
          ],
        }
      : {
          rgb: '255,170,110',
          r: 130,
          stops: [
            // Everything under 0.242 is behind the glyphs and never shows.
            [0, 0.21],
            [0.242, 0.192],
            [0.281, 0.163],
            [0.36, 0.091],
            [0.4, 0.062],
            [0.47, 0.043],
            [0.55, 0.024],
            [0.66, 0.015],
            [0.78, 0.009],
            [1, 0],
          ],
        };
  }
  // Light keeps its tight hug. The plain numeral already has it as a 16px
  // shadow; the milestone numeral had it as the filter this replaces.
  return mile
    ? {
        rgb: '245,158,11',
        r: 56,
        stops: [
          [0, 0.13],
          [0.5, 0.07],
          [1, 0],
        ],
      }
    : null;
}

function NumeralHalo({
  label,
  mile,
  isDark,
}: {
  label: string;
  mile: boolean;
  isDark: boolean;
}) {
  const spec = haloSpec(mile, isDark);
  if (!spec) return null;

  const { r } = spec;
  // Centred on the digits' advance box, which is within a few points of their
  // ink either way — nothing a 130pt pool can show.
  const cx = (label.length * NUM_DIGIT_ADVANCE) / 2;
  const cy = (NUM_CAP_TOP + NUM_BASELINE) / 2 - (mile ? 0 : NUM_TEXT_RISE);
  // Gradient ids are resolved across every mounted Svg root, not per root, so
  // the variant is baked into the id — the same reason the milestone discs
  // suffix theirs with the day.
  const id = `numHalo-${mile ? 'mile' : 'warm'}-${isDark ? 'dark' : 'light'}`;

  return (
    <Svg
      width={r * 2}
      height={r * 2}
      pointerEvents="none"
      style={[styles.halo, { left: cx - r, top: cy - r }]}
    >
      <Defs>
        <RadialGradient id={id} cx={r} cy={r} rx={r} ry={r} gradientUnits="userSpaceOnUse">
          {spec.stops.map(([offset, opacity]) => (
            // rgb + stopOpacity, never an rgba() string: react-native-svg drops
            // the alpha channel of an rgba stopColor and paints it opaque.
            <Stop
              key={offset}
              offset={offset}
              stopColor={`rgb(${spec.rgb})`}
              stopOpacity={opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
    </Svg>
  );
}

function GradientNumeral({ label, isDark }: { label: string; isDark: boolean }) {
  // Wide enough for three digits at 88px; the text is left-anchored so extra
  // width costs nothing. Nothing here bleeds outside the box any more — the
  // celebration glow is `NumeralHalo`, its own Svg behind this one.
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
      </Defs>
      <SvgText
        x="0"
        y={NUM_BASELINE}
        fill="url(#numInk)"
        fontFamily={Fonts.outfit.extrabold}
        fontSize={NUM_FONT_SIZE}
      >
        {label}
      </SvgText>
    </Svg>
  );
}

function ExtendPill({
  label,
  dest,
  go,
  c,
  state,
}: {
  label: string;
  dest: Destination;
  go: boolean;
  c: StreakColorTokens;
  state: StreakHeroState;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} — go to ${dest}`}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        analytics.track('streak:extend_pill_tap', { pill: label, destination: dest, state });
        // The user came here to go do the thing, not to come back to a stale
        // count — so the screen dismisses on the way out. `dismissTo` performs
        // the pop and the navigation as ONE operation: popping and pushing in
        // the same tick would aim the push at nav state the pop is still
        // unwinding.
        router.dismissTo(ROUTES[dest] as never);
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
  monthLabel,
}: {
  day: StreakCalendarDay;
  c: StreakColorTokens;
  monthLabel: string;
}) {
  if (day.day === null) return <View style={styles.calCell} />;

  const a11y = calendarDayLabel(day, monthLabel);

  if (day.milestone) {
    // Gradient ids are resolved across every mounted Svg root, not per root, so
    // a shared id would have every milestone disc read one cell's gradient.
    const gradientId = `mileDisc-${day.day}`;
    return (
      <View style={styles.calCell} accessible accessibilityLabel={a11y}>
        <View style={[styles.discRing, { backgroundColor: 'rgba(251,191,36,0.55)' }]}>
          <View style={[styles.discGap, { backgroundColor: c.bg }]}>
            <View style={styles.disc}>
              <Svg width={DISC} height={DISC} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient
                    id={gradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={DISC}
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop offset="0" stopColor="#fbbf24" />
                    <Stop offset="1" stopColor="#f59e0b" />
                  </LinearGradient>
                </Defs>
                <Path d={discPath()} fill={`url(#${gradientId})`} />
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
      <View style={styles.calCell} accessible accessibilityLabel={a11y}>
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
      <View style={styles.calCell} accessible accessibilityLabel={a11y}>
        <RainGlyph color={c.gold} />
      </View>
    );
  }

  // An unlogged today still has to be findable.
  //
  // ⚠️ DELIBERATE DIVERGENCE FROM THE MOCK — flagged in the PR for Ty to veto.
  // The mock puts the ring on the cell itself (`border-radius:18px` + an inset
  // shadow on a 1/7-width grid cell), which renders as a ~50×36 stadium. That
  // is the same silhouette as a single-day run pill, just hollow instead of
  // filled, and it is the one mark on this calendar that isn't a 34px disc.
  // Review asked for a fixed circle matching the disc sizes. Revert to
  // `[styles.calCell, { borderWidth: 1.75, borderColor, borderRadius: 18 }]`
  // to restore the mock exactly.
  if (day.isToday) {
    return (
      <View style={styles.calCell} accessible accessibilityLabel={a11y}>
        <View style={styles.todayRing}>
          <Text
            maxFontSizeMultiplier={1}
            style={[styles.dayLabel, styles.dayLabelStrong, { color: c.text }]}
          >
            {day.day}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.calCell} accessible accessibilityLabel={a11y}>
      <Text
        maxFontSizeMultiplier={1}
        style={[
          styles.dayLabel,
          day.active && styles.dayLabelStrong,
          {
            color: day.active ? c.runInk : c.offInk,
            opacity: day.future ? 0.34 : 1,
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

const EMPTY_DAYS: ReadonlySet<string> = new Set();

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
  const { snapshot, activityDays, localDate, windowStart, alive, effectiveStreak } = card;
  const activeDates = new Set(activityDays.map((d) => d.local_date));

  // Rain-cloud days and milestone discs are annotations OF a run: they say
  // "a check bridged this" and "the count hit 7 here". Once the run is dead
  // those sentences have no subject, and both derivations are anchored to
  // `last_activity_date`, which now belongs to a run that ended. The logged
  // days themselves stay painted — that history is real and did happen.
  const covered = alive ? deriveCoveredDays(snapshot, activeDates, windowStart) : EMPTY_DAYS;
  const milestoneDays = alive
    ? deriveMilestoneDays(snapshot, activeDates, covered, windowStart)
    : EMPTY_DAYS;

  const state = deriveHeroState(effectiveStreak, activeDates.has(localDate));
  const weeks = buildCalendar({ today: localDate, activeDates, covered, milestoneDays });

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
      weeks: buildCalendar({ today, activeDates: active, covered, milestoneDays }),
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
  halo: { position: 'absolute' },
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
  // The message card's two-line height, held while the copy is in flight.
  skeletonMsg: { height: 66 },

  failed: { marginHorizontal: SCREEN_PAD, marginTop: 48, alignItems: 'center', gap: 16 },
  failedText: {
    fontFamily: Fonts.inter.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retry: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryLabel: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: '#ffffff',
  },

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
  dayLabel: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.inter.medium },
  dayLabelStrong: { fontFamily: Fonts.inter.semibold },
  todayRing: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    borderWidth: 1.75,
    borderColor: 'rgba(225,29,72,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
