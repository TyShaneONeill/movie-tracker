/**
 * PS-15 v2 — the streak-extended celebration takeover.
 *
 * House lights dim over whatever screen you were on, the camera arrives, the
 * lamp stutters twice and locks, the number rolls from yesterday's streak to
 * today's, and a button you can actually push into the screen sends you back.
 * The timing is the playground's signed-off "House Cut" preset, derived in
 * lib/streak-celebration — not transcribed here.
 *
 * NOT AN RN MODAL (trap 07). Modal re-mounts into its own window and drops the
 * first frames, so the dim hard-cuts instead of easing in. This is a root-level
 * absolutely-positioned sibling of the navigator's <Stack>, which also puts it
 * over the tab bar.
 *
 * NOTHING IS DRIVEN FROM JS (trap 05). Every value is one UI-thread Reanimated
 * run, so tap-to-skip is a handful of cancelAnimation calls rather than a pile
 * of orphaned timers, and the jitter doesn't stutter under Metro or a cold TTI.
 * The only JS timers are the haptic marks, which are discrete events rather
 * than animation — and they are cleared on skip and unmount alongside.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Fonts } from '@/constants/theme';
import { analytics } from '@/lib/analytics';
import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from '@/lib/haptics';
import {
  FLASH_MS,
  HOUSE_CUT,
  LOCK_MS,
  NUMERAL_DIM_OPACITY,
  digitColumns,
  flickerOnsets,
  phaseAt,
  takeoverTimeline,
} from '@/lib/streak-celebration';
import { TakeoverStage } from '@/components/streak/takeover-stage';
import { useStreak, type PendingCelebration } from '@/lib/streak-context';

/* ------------------------------------------------------------------ tuning */

/** Numeral box. Outfit clips without an explicit lineHeight — trap 08. */
const NUM_FONT_SIZE = 106;
const NUM_BOX = 112;
/** Button bottom-edge depth: the shelf's height and the face's press travel. */
const BUTTON_DEPTH = 8;
const PRESS_IN_MS = 55;
const PRESS_OUT_MS = 200;
/** The face rebounds this far past its rest before settling. */
const RELEASE_OVERSHOOT_PX = 2.5;
/** How long the whole thing takes to clear once dismissed. */
const EXIT_MS = 260;
/** Odometer supports up to this many columns; a streak past 9999 is not a risk. */
const MAX_COLUMNS = 4;
/** One jitter tick. The shake is a triangle wave of these, not random per-frame. */
const SHAKE_TICK_MS = 68;
/** The button rises from here, overshoots its rest by 3px, and settles. */
const BUTTON_RISE_PX = 46;
const BUTTON_RISE_OVERSHOOT_PX = -3;

const CTA_COPY = 'Keep it rolling';

// The light envelope is symmetric ON PURPOSE (trap 02): an expo-out races every
// interval to its end value and turns a beat of light into a strobe, and there
// are six intervals back to back here.
const ENVELOPE = Easing.bezier(0.4, 0, 0.6, 1);
const ENTER = Easing.bezier(0.16, 1, 0.3, 1);
const ROLL = Easing.bezier(0.2, 0.7, 0.2, 1);
const EXIT = Easing.bezier(0.4, 0, 1, 1);

/**
 * The lamp's stutter-and-lock, as {to, duration} steps. Derived from the preset
 * so it always sums to flickerSpan(): a dark gap, a hard strike, the lit hold,
 * a collapse — twice — then the ramp that locks the beam.
 */
function lightSteps(): { to: number; duration: number }[] {
  const steps: { to: number; duration: number }[] = [];
  for (let i = 0; i < HOUSE_CUT.flickCount; i++) {
    steps.push({ to: 0, duration: HOUSE_CUT.flickRhythm });
    steps.push({ to: 1, duration: 14 });
    steps.push({ to: 0.9, duration: FLASH_MS - 30 });
    steps.push({ to: 0.05, duration: 16 });
  }
  steps.push({ to: 0.42, duration: LOCK_MS * 0.45 });
  steps.push({ to: 1, duration: LOCK_MS * 0.55 });
  return steps;
}

/* -------------------------------------------------------------------- root */

/**
 * Mounted once at the app root. Renders null — and costs nothing — until the
 * streak context reports an extension.
 */
export function StreakCelebrationTakeover() {
  const { pendingCelebration, dismissCelebration } = useStreak();
  if (!pendingCelebration) return null;
  // Keyed so a second celebration gets fresh shared values rather than
  // inheriting the last one's end state.
  return (
    <Takeover
      key={pendingCelebration.id}
      celebration={pendingCelebration}
      onDismissed={dismissCelebration}
    />
  );
}

/* --------------------------------------------------------------- the piece */

function Takeover({
  celebration,
  onDismissed,
}: {
  celebration: PendingCelebration;
  onDismissed: () => void;
}) {
  const { from, to, milestone } = celebration;
  const { width: screenWidth } = useWindowDimensions();
  const timeline = useMemo(() => takeoverTimeline(milestone !== null), [milestone]);
  const columns = useMemo(() => digitColumns(from, to), [from, to]);

  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const startedAt = useRef(0);
  const atRest = useRef(false);
  const dismissing = useRef(false);
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dim = useSharedValue(0);
  // The content's own fade, so the numeral's 0.19 floor doesn't sit visible
  // over an undimmed screen for the first frames.
  const veil = useSharedValue(0);
  const keyLine = useSharedValue(0);
  const camOpacity = useSharedValue(0);
  const camScale = useSharedValue(0.62);
  const camY = useSharedValue(26);
  const shakeAmp = useSharedValue(0);
  const shakePhase = useSharedValue(0);
  const light = useSharedValue(0);
  const numScale = useSharedValue(1);
  const subLine = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonY = useSharedValue(BUTTON_RISE_PX);
  const pressY = useSharedValue(0);
  const exit = useSharedValue(1);

  // One per possible column, created unconditionally — hooks cannot be looped
  // over a variable length. Each rolls 0 → NUM_BOX with its own stagger.
  const roll0 = useSharedValue(0);
  const roll1 = useSharedValue(0);
  const roll2 = useSharedValue(0);
  const roll3 = useSharedValue(0);
  const rolls = useMemo(
    () => [roll0, roll1, roll2, roll3],
    [roll0, roll1, roll2, roll3]
  );

  const clearHaptics = useCallback(() => {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  }, []);

  /**
   * Jump every value to the lit end state, with the button already in. Skip and
   * Reduce Motion share it. One cancelAnimation per value and we are done —
   * which is the whole reason nothing is driven from a JS timer (trap 05).
   */
  const settle = useCallback(() => {
    [
      dim, veil, keyLine, camOpacity, camScale, camY, shakeAmp, shakePhase,
      light, numScale, subLine, buttonOpacity, buttonY, ...rolls,
    ].forEach(cancelAnimation);

    dim.value = 1;
    veil.value = 1;
    keyLine.value = 1;
    camOpacity.value = 1;
    camScale.value = 1;
    camY.value = 0;
    shakeAmp.value = 0;
    shakePhase.value = 0;
    light.value = 1;
    numScale.value = 1;
    subLine.value = 1;
    buttonOpacity.value = 1;
    buttonY.value = 0;
    rolls.forEach((v) => {
      v.value = NUM_BOX;
    });
  }, [
    dim, veil, keyLine, camOpacity, camScale, camY, shakeAmp, shakePhase, light,
    numScale, subLine, buttonOpacity, buttonY, rolls,
  ]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduceMotion(v);
      })
      .catch(() => {
        if (alive) setReduceMotion(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // The sequence. Waits for the Reduce Motion answer so a motion-sensitive user
  // never catches the first frames of an animation we are about to skip.
  useEffect(() => {
    if (reduceMotion === null) return;

    analytics.track('streak:celebration_shown', {
      from,
      to,
      milestone: milestone ?? null,
    });
    startedAt.current = Date.now();

    if (reduceMotion) {
      settle();
      atRest.current = true;
      hapticNotification(NotificationFeedbackType.Success);
      return;
    }

    const t = timeline;

    /* 1 — house lights down over the screen you were on */
    dim.value = withTiming(1, { duration: HOUSE_CUT.dimDur, easing: ENVELOPE });
    veil.value = withTiming(1, {
      duration: Math.round(HOUSE_CUT.dimDur * 0.7),
      easing: ENVELOPE,
    });
    keyLine.value = withDelay(t.camStart, withTiming(1, { duration: 280, easing: ENTER }));

    /* 2 — the camera arrives: a confident pop, then settle */
    camOpacity.value = withDelay(
      t.camStart,
      withTiming(1, { duration: HOUSE_CUT.camDur * 0.62, easing: ENTER })
    );
    camY.value = withDelay(
      t.camStart,
      withTiming(0, { duration: HOUSE_CUT.camDur, easing: ENTER })
    );
    camScale.value = withDelay(
      t.camStart,
      withSequence(
        withTiming(1.06, { duration: HOUSE_CUT.camDur * 0.62, easing: ENTER }),
        withTiming(1, { duration: HOUSE_CUT.camDur * 0.38, easing: ENTER })
      )
    );

    /* 3 — spin-up: the motor catches, ramps in and eases out. Amplitude and
       jitter are separate values — the envelope shapes a wave that is itself
       one repeating UI-thread run, never a per-frame JS random. */
    shakeAmp.value = withDelay(
      t.spinStart,
      withSequence(
        withTiming(1, { duration: HOUSE_CUT.spinDur * 0.4, easing: ENVELOPE }),
        withTiming(0, { duration: HOUSE_CUT.spinDur * 0.6, easing: ENVELOPE })
      )
    );
    shakePhase.value = withDelay(
      t.spinStart,
      withRepeat(
        withTiming(1, { duration: SHAKE_TICK_MS, easing: Easing.linear }),
        Math.max(2, Math.round(HOUSE_CUT.spinDur / SHAKE_TICK_MS)),
        true
      )
    );

    /* 4 — the lamp stutters, then locks. One value drives lamp, beam, body and
       the numeral's reveal together. */
    light.value = withDelay(
      t.flickStart,
      withSequence(
        ...lightSteps().map((s) =>
          withTiming(s.to, { duration: s.duration, easing: ENVELOPE })
        )
      )
    );

    /* 5 — the flip, gated on the beam being locked */
    columns.forEach((column, i) => {
      if (!column.rolls || i >= MAX_COLUMNS) return;
      const peak = NUM_BOX * (1 + 0.1 * HOUSE_CUT.overshoot);
      rolls[i].value = withDelay(
        t.flipAt + i * HOUSE_CUT.digitStagger,
        withSequence(
          withTiming(peak, { duration: HOUSE_CUT.rollDur * 0.74, easing: ROLL }),
          withTiming(NUM_BOX, { duration: HOUSE_CUT.rollDur * 0.26, easing: ROLL })
        )
      );
    });
    numScale.value = withDelay(
      t.flipAt,
      withSequence(
        withTiming(1 + 0.07 * HOUSE_CUT.overshoot, {
          duration: HOUSE_CUT.rollDur * 0.76,
          easing: ROLL,
        }),
        withTiming(1, { duration: HOUSE_CUT.rollDur * 0.24, easing: ROLL })
      )
    );
    subLine.value = withDelay(
      t.flipAt + HOUSE_CUT.rollDur * 0.55,
      withTiming(1, { duration: 300, easing: ENTER })
    );

    /* 6 — the number owns the screen alone, then the button rises */
    buttonOpacity.value = withDelay(
      t.btnAt,
      withTiming(1, { duration: HOUSE_CUT.btnDur * 0.5, easing: ENTER })
    );
    buttonY.value = withDelay(
      t.btnAt,
      withSequence(
        withTiming(BUTTON_RISE_OVERSHOOT_PX, {
          duration: HOUSE_CUT.btnDur * 0.74,
          easing: ENTER,
        }),
        withTiming(0, { duration: HOUSE_CUT.btnDur * 0.26, easing: ENTER })
      )
    );

    /* Haptic marks. Discrete events on the clock the animation already keeps —
       the buzz is the light catching, so it hangs off the flicker's own onsets
       rather than a second timeline that could drift from it. */
    const mark = (at: number, fire: () => void) => {
      hapticTimers.current.push(setTimeout(fire, at));
    };
    flickerOnsets().forEach((onset) => {
      mark(t.flickStart + onset, () => hapticImpact(ImpactFeedbackStyle.Light));
    });
    mark(t.flipEnd, () => hapticNotification(NotificationFeedbackType.Success));
    mark(t.total, () => {
      atRest.current = true;
    });

    return () => {
      clearHaptics();
    };
  }, [
    reduceMotion, timeline, columns, from, to, milestone, settle, clearHaptics,
    dim, veil, keyLine, camOpacity, camScale, camY, shakeAmp, shakePhase, light,
    numScale, subLine, buttonOpacity, buttonY, rolls,
  ]);

  useEffect(() => clearHaptics, [clearHaptics]);

  /** Fade the whole thing out, then hand back at the settle point — not at t=0. */
  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    clearHaptics();
    exit.value = withTiming(0, { duration: EXIT_MS, easing: EXIT }, (finished) => {
      if (finished) runOnJS(onDismissed)();
    });
  }, [clearHaptics, exit, onDismissed]);

  /** Whole-screen tap: jump to the lit end state, or dismiss if already there. */
  const onBackdropPress = useCallback(() => {
    if (dismissing.current) return;
    if (atRest.current) {
      dismiss();
      return;
    }
    const at = Date.now() - startedAt.current;
    analytics.track('streak:celebration_skipped', {
      at_ms: at,
      phase: phaseAt(at, timeline),
    });
    clearHaptics();
    settle();
    atRest.current = true;
  }, [clearHaptics, dismiss, settle, timeline]);

  const onCtaPress = useCallback(() => {
    analytics.track('streak:celebration_cta_tap');
    hapticSelection();
    dismiss();
  }, [dismiss]);

  /* ------------------------------------------------------------- styles */

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.value }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const keyStyle = useAnimatedStyle(() => ({
    opacity: keyLine.value,
    transform: [{ translateY: -6 + 6 * keyLine.value }],
  }));
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: camOpacity.value,
    transform: [{ scale: camScale.value }, { translateY: camY.value }],
  }));
  // Mechanical jitter, not a wobble: a triangle wave across x against a faster
  // sine across y, so the two never trace a circle.
  const shakeStyle = useAnimatedStyle(() => {
    const amp = shakeAmp.value * HOUSE_CUT.shakePx;
    const phase = shakePhase.value;
    return {
      transform: [
        { translateX: (phase * 2 - 1) * amp },
        { translateY: Math.sin(phase * Math.PI * 3) * amp },
      ],
    };
  });
  const numeralStyle = useAnimatedStyle(() => ({
    // The numeral is dim until the beam finds it — the flicker is what reveals
    // it, not a fade-in. Nothing else touches its opacity.
    opacity: NUMERAL_DIM_OPACITY + (1 - NUMERAL_DIM_OPACITY) * light.value,
    transform: [{ scale: numScale.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subLine.value,
    transform: [{ translateY: 6 - 6 * subLine.value }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonY.value }],
  }));
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressY.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      accessibilityViewIsModal
      accessible={false}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Skip the streak celebration"
      />

      <Animated.View style={[styles.content, veilStyle]} pointerEvents="box-none">
        <Animated.Text
          style={[styles.keyLine, keyStyle]}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.2}
        >
          Streak extended
        </Animated.Text>

        <TakeoverStage
          entranceStyle={entranceStyle}
          shakeStyle={shakeStyle}
          light={light}
          milestone={milestone !== null}
          screenWidth={screenWidth}
        />

        <Animated.View
          style={[styles.numeral, numeralStyle]}
          accessibilityRole="text"
          accessibilityLabel={`${to} day streak`}
        >
          {columns.map((column, i) => (
            <DigitSlot
              key={i}
              column={column}
              offset={i < MAX_COLUMNS ? rolls[i] : undefined}
            />
          ))}
        </Animated.View>

        <Animated.Text style={[styles.sub, subStyle]} maxFontSizeMultiplier={1.2}>
          day streak
        </Animated.Text>

        <Animated.View style={[styles.ctaWrap, buttonStyle]}>
          {/* The depth is geometry, not a shadow (trap 06): a real sibling shelf
              behind the face, and the face translates down onto it. */}
          <View style={styles.ctaShelf} />
          <Animated.View style={faceStyle}>
            <Pressable
              style={styles.ctaFace}
              onPress={onCtaPress}
              onPressIn={() => {
                pressY.value = withTiming(BUTTON_DEPTH, {
                  duration: PRESS_IN_MS,
                  easing: ENVELOPE,
                });
              }}
              onPressOut={() => {
                pressY.value = withSequence(
                  withTiming(-RELEASE_OVERSHOOT_PX, {
                    duration: PRESS_OUT_MS * 0.6,
                    easing: ENTER,
                  }),
                  withTiming(0, { duration: PRESS_OUT_MS * 0.4, easing: ENTER })
                );
              }}
              // The ripple fights the depress and reads as two competing
              // feedbacks for one press.
              android_ripple={null}
              accessibilityRole="button"
              accessibilityLabel={CTA_COPY}
            >
              <Text style={styles.ctaLabel} maxFontSizeMultiplier={1.2}>
                {CTA_COPY}
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * One odometer column. The clip box is what lets it roll — and per trap 09 it
 * is also why the numeral carries no text shadow: the box would clip the glow
 * to a rectangle and paint a glowing slab behind the digit.
 */
function DigitSlot({
  column,
  offset,
}: {
  column: { previous: string; next: string; rolls: boolean };
  offset?: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset ? -offset.value : 0 }],
  }));

  if (!column.rolls || !offset) {
    return <Text style={styles.digit}>{column.next}</Text>;
  }

  return (
    <View style={styles.slot}>
      <Animated.View style={style}>
        <Text style={styles.digit}>{column.previous || ' '}</Text>
        <Text style={styles.digit}>{column.next}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, elevation: 100 },
  dim: { backgroundColor: 'rgba(9,6,10,0.94)' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  keyLine: {
    fontFamily: Fonts.inter.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#a1a1aa',
    marginBottom: 8,
  },
  numeral: { flexDirection: 'row', alignItems: 'flex-start' },
  slot: { height: NUM_BOX, overflow: 'hidden' },
  digit: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: NUM_FONT_SIZE,
    // Explicit, and matched to the slot: Outfit clips its ascenders at
    // line-height 1 in RN, and a drifting box shifts the columns mid-roll.
    lineHeight: NUM_BOX,
    color: '#ffffff',
    // Otherwise the columns change width as the digits change — trap 08.
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  sub: {
    fontFamily: Fonts.inter.regular,
    fontSize: 15,
    lineHeight: 20,
    color: '#d4d4d8',
    marginTop: 6,
  },
  ctaWrap: { marginTop: 44 },
  ctaShelf: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: BUTTON_DEPTH,
    bottom: -BUTTON_DEPTH,
    backgroundColor: '#7f1d33',
    borderRadius: 18,
  },
  ctaFace: {
    backgroundColor: '#e11d48',
    borderRadius: 18,
    paddingHorizontal: 34,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaLabel: {
    fontFamily: Fonts.outfit.semibold,
    fontSize: 17,
    lineHeight: 22,
    color: '#ffffff',
  },
});
