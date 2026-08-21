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
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  type AnimatedStyle,
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
import {
  ROOM_BLACK,
  SCENE_CONTRACT,
  deriveScene,
  mixHex,
  sceneLayout,
  toScreen,
} from '@/lib/streak-scene';
import { cameraPalette } from '@/constants/streak-theme';
import { useStreak, type PendingCelebration } from '@/lib/streak-context';

/* ------------------------------------------------------------------ tuning */

/**
 * Numeral box. Outfit clips without an explicit lineHeight — trap 08.
 *
 * 124pt is the scene contract's number size. Deliberately NOT scaled with the
 * scene: the roll distance is NUM_BOX, so making it a function of screen width
 * would make the House Cut's roll target device-dependent for a ±3% change in
 * relative size that nobody can see.
 */
const NUM_FONT_SIZE = SCENE_CONTRACT.numeralSize;
const NUM_BOX = Math.round(NUM_FONT_SIZE * (112 / 106));
/** The scene mock's own tracking, −5.4% of the size. */
const NUM_TRACKING = -NUM_FONT_SIZE * 0.054;
/**
 * Where the glyph's ink actually sits inside the line box, per platform.
 *
 * RN does not centre a glyph in an oversized `lineHeight` the same way on both
 * platforms, and at this size the slack is large enough to see: measured
 * against the mock, Android lands the ink 0.3 scene units low (fine) while iOS
 * lands it 11.7 units HIGH. Left uncorrected the number floats above the beam
 * it is supposed to be sitting in, on one platform only.
 *
 * Measured, not guessed — Pixel 8 emulator and iPhone 16 Pro simulator, ink
 * bounding box of the white face against the mock's own 312.5. Expressed as a
 * FRACTION of the size, like every other constant here, because the offset is a
 * font metric: retune `numeralSize` and a raw 11.7 would silently stop landing.
 */
const NUM_BASELINE_FIX = Platform.OS === 'ios' ? NUM_FONT_SIZE * 0.0944 : 0;
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
/** Copies in the numeral's extruded backlight. See `extrude` below. */
const EXTRUDE_STEPS = 8;
/** The CTA's dock. The mock's 26 plus room for a home indicator / gesture bar. */
const CTA_BOTTOM = 44;
/** One jitter tick. The shake is a triangle wave of these, not random per-frame. */
const SHAKE_TICK_MS = 68;
/** The button rises from here, overshoots its rest by 3px, and settles. */
const BUTTON_RISE_PX = 46;
const BUTTON_RISE_OVERSHOOT_PX = -3;
/**
 * How long the takeover ignores skip input after it appears.
 *
 * This thing arrives unannounced, on top of whatever you were doing — the
 * founder's own first run fired off a like while he was reaching for the
 * comment box, and the taps already in flight skipped the sequence AND then
 * dismissed it before he saw a frame of it. Anything that lands this soon is a
 * tap aimed at the screen underneath, not a decision about the celebration.
 * The CTA is deliberately NOT gated: it does not exist yet at this point in the
 * sequence (t.btnAt is far past it), so a press on it is always deliberate.
 */
const GRACE_MS = 600;

const CTA_COPY = 'Keep it rolling';
/** Gutter for the text rows. Deliberately NOT on the column — see styles.content. */
const CONTENT_PADDING = 24;

// The light envelope is symmetric ON PURPOSE (trap 02): an expo-out races every
// interval to its end value and turns a beat of light into a strobe, and there
// are six intervals back to back here.
const ENVELOPE = Easing.bezier(0.4, 0, 0.6, 1);
const ENTER = Easing.bezier(0.16, 1, 0.3, 1);
const ROLL = Easing.bezier(0.2, 0.7, 0.2, 1);
const EXIT = Easing.bezier(0.4, 0, 1, 1);
/** A lamp behind a shutter jumps between levels; it does not breathe. */
const HARD_CUT = Easing.steps(1, true);

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

/* -------------------------------------------------------------- the lamp */

/** The gutter's period. */
const FLICKER_MS = 4300;

/**
 * The lamp's own flicker, verbatim from the scene mock's `@keyframes flick`.
 *
 * That animation runs on `steps(1, end)`, so nothing here interpolates: each
 * entry is a level that HOLDS until the next one's mark. Read it as
 * "[percent of the period, level from here]".
 *
 * The irregular spacing is the point — evenly spaced flicker reads as a broken
 * loop, and a soft fade reads as a dimmer rather than a shutter (brief trap 7).
 *
 * CONSTRAINT — re-count the window before adding or moving a keyframe.
 * These six down-transitions (3%, 9%, 28%, 55%, 71%, 89% = 129, 387, 1204,
 * 2365, 3053, 3827ms) sit against WCAG 2.3.1's general flash threshold, which
 * fails content at MORE than three flashes in any one second. The worst window
 * is the one that WRAPS the cycle — starting at 3827ms it catches 3827, then
 * 4429 and 4687 of the next cycle — and it holds exactly three. That is a
 * boundary case, not a margin: one more dip near the wrap tips it over.
 *
 * The other two conditions were measured off a 188-frame capture of this very
 * loop (see PR #838): magnitude is over the limit (0.906 -> 0.375 relative
 * luminance) and area is well under it (10.9% of a 10-degree field against a
 * 25% limit). All three must be exceeded to fail, so AREA is what currently
 * keeps this compliant — shallowing the dips would not buy any headroom on
 * rate, and only spacing them would.
 */
const FLICKER_KEYS: readonly (readonly [number, number])[] = [
  [0, 1],
  [3, 0.62],
  [4.5, 1],
  [9, 0.84],
  [10, 1],
  [28, 0.55],
  [29.5, 0.93],
  [30.5, 1],
  [55, 0.78],
  [56, 1],
  [71, 0.9],
  [72, 1],
  [89, 0.66],
  [90, 1],
];

/** Each level, and how long it holds before the next hard cut. */
function flickerSteps(): { to: number; duration: number }[] {
  return FLICKER_KEYS.map(([at, to], i) => {
    const until = i + 1 < FLICKER_KEYS.length ? FLICKER_KEYS[i + 1][0] : 100;
    return { to, duration: ((until - at) / 100) * FLICKER_MS };
  });
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // The app is edge-to-edge and this mounts outside the navigator, so nothing
  // insets the CTA for us: on a device with Android's 3-button navigation the
  // bar lands right on top of the button. Same shape as the scan-v2 sticky CTA.
  const insets = useSafeAreaInsets();
  const timeline = useMemo(() => takeoverTimeline(milestone !== null), [milestone]);
  const columns = useMemo(() => digitColumns(from, to), [from, to]);

  // The room is authored dark and the celebration dims the house lights in both
  // themes, so the scene's palette is the dark one either way — see the PR.
  const palette = cameraPalette(milestone !== null ? 'milestone' : 'active', true);
  const ink = palette.sceneInk;

  /**
   * Where the chrome sits ON the scene.
   *
   * There is no centred column any more. The number is placed at the point the
   * derived beam actually lands on, and the key line where the mock puts it —
   * both in scene coordinates, mapped through the same layout the stage uses,
   * so nothing can drift apart from the room it is standing in.
   */
  const place = useMemo(() => {
    const layout = sceneLayout(screenWidth, screenHeight);
    const scene = deriveScene();
    const centre = toScreen(layout, scene.numeralX, scene.numeralY);
    const key = toScreen(layout, 22, 52);
    return {
      key: { left: key.x, top: key.y },
      // A screen-wide row, shifted so its centre lands on the beam. Centring
      // this way means nobody has to measure the glyphs before placing them.
      numeral: {
        // Half the trailing kern back. Both platforms add letterSpacing after
        // the LAST glyph too, so centring the advance box leaves the ink itself
        // sitting half a kern to the right of the beam's landing point —
        // measured at 3pt against the mock before this correction.
        left: centre.x - screenWidth / 2 + NUM_TRACKING / 2,
        top: centre.y - NUM_BOX / 2 + NUM_BASELINE_FIX * layout.scale,
        width: screenWidth,
        height: NUM_BOX,
      },
      sub: {
        left: centre.x - screenWidth / 2,
        top: centre.y + 82 * (NUM_FONT_SIZE / 112) * layout.scale,
        width: screenWidth,
      },
    };
  }, [screenWidth, screenHeight]);

  /**
   * The numeral's backlight: copies stepped along the projected DEPTH axis, far
   * to near, each mixed further toward the room's black.
   *
   * Eight steps rather than the mock's sixteen. Across the contract's 9.5pt
   * span that is 1.2pt apart and a 7% tonal step — invisible — and it halves the
   * number of rows that have to roll in step with the odometer.
   */
  const extrude = useMemo(() => {
    const layout = sceneLayout(screenWidth, screenHeight);
    const scene = deriveScene();
    const span = scene.extrudeSpan * layout.scale;
    return Array.from({ length: EXTRUDE_STEPS }, (_, i) => {
      const g = (EXTRUDE_STEPS - i) / EXTRUDE_STEPS;
      return {
        dx: scene.depthDir.x * span * g,
        dy: scene.depthDir.y * span * g,
        color: mixHex(palette.sceneSolid, ROOM_BLACK, 0.55 * g),
      };
    });
  }, [screenWidth, screenHeight, palette.sceneSolid]);

  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  /** Mirrors `dismissing` for render — a ref alone can't drop pointerEvents. */
  const [exiting, setExiting] = useState(false);
  const startedAt = useRef(0);
  /**
   * First render, NOT sequence start. The backdrop is touchable from the frame
   * it mounts, while `startedAt` is only stamped once the Reduce Motion probe
   * resolves — anchoring the grace here covers that gap too.
   */
  const mountedAt = useRef(Date.now());
  const atRest = useRef(false);
  const dismissing = useRef(false);
  const sequenceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  /**
   * The lamp's ambient gutter, running UNDER the sequence's own beats. Starts
   * at 1 so Reduce Motion — which never starts the loop — gets a steady lamp
   * for free, and so `settle()` has nothing to reset.
   */
  const flicker = useSharedValue(1);
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
  const rolls = useMemo(() => [roll0, roll1, roll2, roll3], [roll0, roll1, roll2, roll3]);

  /**
   * One worklet per COLUMN, not per rendered slot. The numeral is drawn nine
   * times over (the face plus eight backlight steps) and every copy rolls off
   * the same four shared values, so building the style inside DigitSlot span up
   * to thirty-six identical worklets for four distinct animations.
   *
   * Hooks cannot be looped over a variable length, so all four exist always —
   * columns that do not roll simply never read theirs.
   */
  const rollStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: -roll0.value }] }));
  const rollStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: -roll1.value }] }));
  const rollStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: -roll2.value }] }));
  const rollStyle3 = useAnimatedStyle(() => ({ transform: [{ translateY: -roll3.value }] }));
  const rollStyles = useMemo(
    () => [rollStyle0, rollStyle1, rollStyle2, rollStyle3],
    [rollStyle0, rollStyle1, rollStyle2, rollStyle3]
  );

  /**
   * The sequence's JS-side timers: the haptic marks and the at-rest flip. They
   * are discrete events rather than animation — everything that MOVES is a
   * UI-thread Reanimated run — but they still have to die with a skip.
   */
  const clearSequenceTimers = useCallback(() => {
    sequenceTimers.current.forEach(clearTimeout);
    sequenceTimers.current = [];
  }, []);

  /**
   * Jump every value to the lit end state, with the button already in. Skip and
   * Reduce Motion share it. One cancelAnimation per value and we are done —
   * which is the whole reason nothing is driven from a JS timer (trap 05).
   */
  const settle = useCallback(() => {
    [
      dim,
      veil,
      keyLine,
      camOpacity,
      camScale,
      camY,
      shakeAmp,
      shakePhase,
      light,
      numScale,
      subLine,
      buttonOpacity,
      buttonY,
      ...rolls,
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
    dim,
    veil,
    keyLine,
    camOpacity,
    camScale,
    camY,
    shakeAmp,
    shakePhase,
    light,
    numScale,
    subLine,
    buttonOpacity,
    buttonY,
    rolls,
  ]);

  /**
   * Put the keyboard away before the house lights go down. A qualifying action
   * can be recorded from a screen with an open composer — the founder's like
   * fired while he was typing a comment — and the RPC answers a beat later, so
   * the takeover lands on a half-covered screen with the keyboard still up over
   * the button. Runs on mount, ahead of the dim: the sequence effect below waits
   * on the Reduce Motion probe and would leave the keyboard visible through the
   * first frames.
   */
  useEffect(() => {
    Keyboard.dismiss();
  }, []);

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
    keyLine.value = withDelay(
      t.camStart,
      withTiming(1, { duration: 280, easing: ENTER }),
    );

    /* 2 — the camera arrives: a confident pop, then settle */
    camOpacity.value = withDelay(
      t.camStart,
      withTiming(1, { duration: HOUSE_CUT.camDur * 0.62, easing: ENTER }),
    );
    camY.value = withDelay(
      t.camStart,
      withTiming(0, { duration: HOUSE_CUT.camDur, easing: ENTER }),
    );
    camScale.value = withDelay(
      t.camStart,
      withSequence(
        withTiming(1.06, { duration: HOUSE_CUT.camDur * 0.62, easing: ENTER }),
        withTiming(1, { duration: HOUSE_CUT.camDur * 0.38, easing: ENTER }),
      ),
    );

    /* 3 — spin-up: the motor catches, ramps in and eases out. Amplitude and
       jitter are separate values — the envelope shapes a wave that is itself
       one repeating UI-thread run, never a per-frame JS random. */
    shakeAmp.value = withDelay(
      t.spinStart,
      withSequence(
        withTiming(1, { duration: HOUSE_CUT.spinDur * 0.4, easing: ENVELOPE }),
        withTiming(0, { duration: HOUSE_CUT.spinDur * 0.6, easing: ENVELOPE }),
      ),
    );
    shakePhase.value = withDelay(
      t.spinStart,
      withRepeat(
        withTiming(1, { duration: SHAKE_TICK_MS, easing: Easing.linear }),
        Math.max(2, Math.round(HOUSE_CUT.spinDur / SHAKE_TICK_MS)),
        true,
      ),
    );

    /* 4 — the lamp stutters, then locks. One value drives lamp, beam, body and
       the numeral's reveal together. */
    light.value = withDelay(
      t.flickStart,
      withSequence(
        ...lightSteps().map((s) =>
          withTiming(s.to, { duration: s.duration, easing: ENVELOPE }),
        ),
      ),
    );

    /* 5 — the flip, gated on the beam being locked */
    columns.forEach((column, i) => {
      if (!column.rolls || i >= MAX_COLUMNS) return;
      const peak = NUM_BOX * (1 + 0.1 * HOUSE_CUT.overshoot);
      rolls[i].value = withDelay(
        t.flipAt + i * HOUSE_CUT.digitStagger,
        withSequence(
          withTiming(peak, {
            duration: HOUSE_CUT.rollDur * 0.74,
            easing: ROLL,
          }),
          withTiming(NUM_BOX, {
            duration: HOUSE_CUT.rollDur * 0.26,
            easing: ROLL,
          }),
        ),
      );
    });
    numScale.value = withDelay(
      t.flipAt,
      withSequence(
        withTiming(1 + 0.07 * HOUSE_CUT.overshoot, {
          duration: HOUSE_CUT.rollDur * 0.76,
          easing: ROLL,
        }),
        withTiming(1, { duration: HOUSE_CUT.rollDur * 0.24, easing: ROLL }),
      ),
    );
    subLine.value = withDelay(
      t.flipAt + HOUSE_CUT.rollDur * 0.55,
      withTiming(1, { duration: 300, easing: ENTER }),
    );

    /* 6 — the number owns the screen alone, then the button rises */
    buttonOpacity.value = withDelay(
      t.btnAt,
      withTiming(1, { duration: HOUSE_CUT.btnDur * 0.5, easing: ENTER }),
    );
    buttonY.value = withDelay(
      t.btnAt,
      withSequence(
        withTiming(BUTTON_RISE_OVERSHOOT_PX, {
          duration: HOUSE_CUT.btnDur * 0.74,
          easing: ENTER,
        }),
        withTiming(0, { duration: HOUSE_CUT.btnDur * 0.26, easing: ENTER }),
      ),
    );

    /* Haptic marks. Discrete events on the clock the animation already keeps —
       the buzz is the light catching, so it hangs off the flicker's own onsets
       rather than a second timeline that could drift from it. */
    const mark = (at: number, fire: () => void) => {
      sequenceTimers.current.push(setTimeout(fire, at));
    };
    flickerOnsets().forEach((onset) => {
      mark(t.flickStart + onset, () => hapticImpact(ImpactFeedbackStyle.Light));
    });
    mark(t.flipEnd, () => hapticNotification(NotificationFeedbackType.Success));
    mark(t.total, () => {
      atRest.current = true;
    });

    return () => {
      clearSequenceTimers();
    };
  }, [
    reduceMotion,
    timeline,
    columns,
    from,
    to,
    milestone,
    settle,
    clearSequenceTimers,
    dim,
    veil,
    keyLine,
    camOpacity,
    camScale,
    camY,
    shakeAmp,
    shakePhase,
    light,
    numScale,
    subLine,
    buttonOpacity,
    buttonY,
    rolls,
  ]);

  useEffect(() => clearSequenceTimers, [clearSequenceTimers]);

  /**
   * The lamp, as opposed to the sequence.
   *
   * Deliberately its own run and deliberately NOT part of `settle()`: a skip
   * jumps the CELEBRATION to its end state, it does not put the projector out.
   * The lamp keeps guttering for as long as the takeover is up, which is what
   * the mock does and what a running projector does. One UI-thread repeat, so
   * there is nothing to orphan and cancelling is one call (trap 05).
   */
  useEffect(() => {
    if (reduceMotion !== false) return;
    flicker.value = withRepeat(
      withSequence(
        ...flickerSteps().map((s) =>
          withTiming(s.to, { duration: s.duration, easing: HARD_CUT }),
        ),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(flicker);
  }, [reduceMotion, flicker]);

  /** Fade the whole thing out, then hand back at the settle point — not at t=0. */
  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    setExiting(true);
    clearSequenceTimers();
    exit.value = withTiming(0, { duration: EXIT_MS, easing: EXIT }, (finished) => {
      if (finished) runOnJS(onDismissed)();
    });
  }, [clearSequenceTimers, exit, onDismissed]);

  /** Whole-screen tap: jump to the lit end state, or dismiss if already there. */
  const onBackdropPress = useCallback(() => {
    if (dismissing.current) return;
    // Taps already in flight when this appeared were meant for the screen
    // underneath — see GRACE_MS. Costs nothing to check and needs no timer to
    // expire, which is the point: skip has to stay a handful of synchronous
    // cancelAnimation calls.
    if (Date.now() - mountedAt.current < GRACE_MS) return;
    if (atRest.current) {
      dismiss();
      return;
    }
    const at = Date.now() - startedAt.current;
    analytics.track('streak:celebration_skipped', {
      at_ms: at,
      phase: phaseAt(at, timeline),
    });
    clearSequenceTimers();
    settle();
    atRest.current = true;
  }, [clearSequenceTimers, dismiss, settle, timeline]);

  const onCtaPress = useCallback(() => {
    analytics.track('streak:celebration_cta_tap', {
      from,
      to,
      milestone: milestone ?? null,
      // Whether they sat through it or skipped to the button reads very
      // differently, and the shown/skipped events cannot answer it alone.
      at_ms: Date.now() - startedAt.current,
    });
    hapticSelection();
    dismiss();
  }, [dismiss, from, to, milestone]);

  /**
   * Android's back gesture gets the same semantics as a tap anywhere: skip
   * mid-sequence, dismiss once at rest. Returning true swallows the event —
   * without this, back pops the route UNDERNEATH a takeover that stays on
   * screen, because the takeover is a sibling of the navigator rather than a
   * Modal (and a Modal is what it must not be — see the file header).
   *
   * That includes the input grace: a reflexive back press in the first GRACE_MS
   * is the same in-flight reflex a stray tap is, and skipping on it would be the
   * same bug. Note the event is still SWALLOWED during the grace — declining to
   * skip is not the same as letting back pop the route underneath.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackdropPress();
      return true;
    });
    return () => sub.remove();
  }, [onBackdropPress]);

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
    //
    // `light × flicker` is the same single number the stage lights its beam and
    // its lens bloom with (brief trap 6). The number IS the lamp, landing on the
    // phone's glass, so it has to gutter with it — a number holding steady over
    // a stuttering beam reads as two separate lights.
    opacity:
      NUMERAL_DIM_OPACITY + (1 - NUMERAL_DIM_OPACITY) * light.value * flicker.value,
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
      // Once dismissed the overlay is fading but still full-screen: leaving it
      // touchable makes the first 260ms after the tap an invisible dead zone
      // over whatever the user is trying to reach underneath.
      pointerEvents={exiting ? 'none' : 'auto'}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        pointerEvents="none"
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Skip the streak celebration"
      />

      <Animated.View style={[styles.content, veilStyle]} pointerEvents="box-none">
        <TakeoverStage
          entranceStyle={entranceStyle}
          shakeStyle={shakeStyle}
          light={light}
          flicker={flicker}
          milestone={milestone !== null}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />

        <Animated.Text
          style={[styles.keyLine, place.key, keyStyle]}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.2}
        >
          Streak extended
        </Animated.Text>

        {/* The number is the nearest thing in the frame, so it paints last —
            over the stage's vignette, in front of the couch, with the beam
            behind it. Its position is not a layout decision: it is the point
            `numeralDistance` down the derived beam axis, so it lands IN the
            light rather than being shoved to meet it. */}
        {/* One accessibility element for the whole number. Without `accessible`
            the role and label do not make this a node on iOS, and a screen
            reader walks the nine copies underneath instead — announcing the
            digits nine times over. The copies are hidden from both platforms'
            trees for the same reason. `pointerEvents` stays none: the backdrop
            below owns tap-to-skip, and an accessibility element does not need
            to be touchable to be reachable. */}
        <Animated.View
          style={[styles.numeral, place.numeral, numeralStyle]}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${to} day streak`}
        >
          {/* Backlight: stepped copies offset along the camera's own depth
              axis, so the number is a solid in the same world as the projector.
              Filter-free ON PURPOSE (brief trap 1) — a blurred glow lands back
              in the Android feGaussianBlur divergence that cost PR #833. */}
          {extrude.map((step, s) => (
            <View
              key={s}
              style={[
                styles.numeralRow,
                {
                  transform: [{ translateX: step.dx }, { translateY: step.dy }],
                },
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {columns.map((column, i) => (
                <DigitSlot
                  key={i}
                  column={column}
                  color={step.color}
                  rollStyle={i < MAX_COLUMNS ? rollStyles[i] : undefined}
                />
              ))}
            </View>
          ))}
          <View style={styles.numeralRow}>
            {columns.map((column, i) => (
              <DigitSlot
                key={i}
                column={column}
                color={ink}
                rollStyle={i < MAX_COLUMNS ? rollStyles[i] : undefined}
              />
            ))}
          </View>
        </Animated.View>

        <Animated.Text
          style={[styles.sub, place.sub, subStyle]}
          maxFontSizeMultiplier={1.2}
        >
          day streak
        </Animated.Text>

        <View
          style={[
            styles.ctaDock,
            { bottom: Math.max(CTA_BOTTOM, insets.bottom + 16) },
          ]}
          pointerEvents="box-none"
        >
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
                    withTiming(0, {
                      duration: PRESS_OUT_MS * 0.4,
                      easing: ENTER,
                    }),
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
        </View>
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
  color,
  rollStyle,
}: {
  column: { previous: string; next: string; rolls: boolean };
  /** Per-copy: the face is the ink, the backlight's copies step toward black. */
  color: string;
  /** This column's roll, built once in the parent and shared by all nine copies. */
  rollStyle?: AnimatedStyle<ViewStyle>;
}) {
  // The slot's height and the roll distance are both NUM_BOX — unscaled
  // geometry measured against the scene — so an OS font scale would push the
  // glyph out of a box that did not grow with it and land the roll short.
  const digit = (text: string) => (
    <Text style={[styles.digit, { color }]} allowFontScaling={false}>
      {text}
    </Text>
  );

  if (!column.rolls || !rollStyle) return digit(column.next);

  return (
    <View style={styles.slot}>
      <Animated.View style={rollStyle}>
        {digit(column.previous || ' ')}
        {digit(column.next)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, elevation: 100 },
  dim: { backgroundColor: 'rgba(9,6,10,0.94)' },
  // Not a column any more. The scene is full-bleed and every readable thing is
  // placed against ITS composition (see `place`), so a flex stack here would
  // fight the geometry: the number's position is the point the beam lands on,
  // not wherever a column happens to put it.
  content: { flex: 1 },
  keyLine: {
    position: 'absolute',
    fontFamily: Fonts.inter.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#a1a1aa',
  },
  numeral: { position: 'absolute' },
  // Every copy — the face and each step of the backlight — is the same row in
  // the same place, offset by a transform. They share the odometer's shared
  // values, so the backlight rolls with the number instead of detaching from it.
  numeralRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  slot: { height: NUM_BOX, overflow: 'hidden' },
  digit: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: NUM_FONT_SIZE,
    // Explicit, and matched to the slot: Outfit clips its ascenders at
    // line-height 1 in RN, and a drifting box shifts the columns mid-roll.
    lineHeight: NUM_BOX,
    letterSpacing: NUM_TRACKING,
    // Otherwise the columns change width as the digits change — trap 08. It is
    // also why the number is wider here than in the mock: the mock draws one
    // proportional text run, where "13" is 106pt wide and "30" is 140pt. An
    // odometer cannot have the number resize as the digits roll, so these are
    // tabular figures and a constant 133pt regardless of what is showing.
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  sub: {
    position: 'absolute',
    fontFamily: Fonts.inter.regular,
    fontSize: 15,
    lineHeight: 20,
    color: '#d4d4d8',
    textAlign: 'center',
  },
  /** Docks the button at the foot of the screen without resizing it. */
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ctaWrap: { marginHorizontal: CONTENT_PADDING },
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
