/**
 * PS-15 v2 — the celebration takeover's STAGE: whatever theatrical object the
 * light comes out of. Interim build, and deliberately the only visual piece of
 * the takeover, so PR-B can swap the axonometric projector scene in by
 * replacing this file alone.
 *
 * It owns no animation and no timing. The takeover drives every value and hands
 * them down, so a replacement stage inherits the House Cut contract for free and
 * tap-to-skip stays one cancelAnimation in one place. The contract a replacement
 * must honour is TakeoverStageProps:
 *
 *   entranceStyle — the rig's pop-and-settle. Apply to the OUTERMOST view.
 *   shakeStyle    — the motor catching. Apply to an INNER view; per RN trap 04
 *                   neither RN nor CSS composes two transforms on one node, so
 *                   entrance / static tilt / shake must be three nested views.
 *   light         — 0 dark → 1 beam locked, stuttering on the way. Drives the
 *                   lamp, the beam and the body waking up together; one value,
 *                   because a bright stutter into a dim lock reads broken.
 *
 * INTERIM SCOPE: the spools do not turn. The shipped StreakCamera draws its reel
 * holes as loose circles rather than a rotatable group, and regrouping them is a
 * visual change to the live streak screen that a mechanics PR has no business
 * making. The spin-up beat is still there and still occupies its exact window in
 * the timeline — it just reads through the 2px shake alone. PR-B's projector
 * brings its own reels.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { cameraPalette } from '@/constants/streak-theme';
import {
  BEAM_HEIGHT,
  CAMERA_HEIGHT,
  CAMERA_WIDTH,
  StreakBeam,
  StreakCamera,
} from '@/components/streak/streak-camera';
import { HOUSE_CUT } from '@/lib/streak-celebration';

/** Camera occupies this much of the screen's width (spec: widthPct 51). */
const CAMERA_WIDTH_PCT = 0.51;
/** Air between the camera's right edge and the screen's. */
const CAMERA_RIGHT_INSET_PCT = 0.04;
/** Static body tilt, between the entrance and the shake. */
const TILT_DEG = '-8deg';
/**
 * The lamp's position as a fraction of the artwork, per RN trap 03 — the beam
 * origin is a percentage of the camera SVG (lens at x 7.5%, optical axis at
 * y 63%), never a magic pixel offset. Re-derive if the artwork changes.
 */
const LENS_X_PCT = 0.075;
const LENS_AXIS_Y_PCT = 101 / 160;

export interface TakeoverStageProps {
  entranceStyle: AnimatedStyle<ViewStyle>;
  shakeStyle: AnimatedStyle<ViewStyle>;
  light: SharedValue<number>;
  milestone: boolean;
  screenWidth: number;
}

export function TakeoverStage({
  entranceStyle,
  shakeStyle,
  light,
  milestone,
  screenWidth,
}: TakeoverStageProps) {
  // Dark and lit palettes of the same artwork. The lit copy cross-fades in over
  // the dark one on `light`, which gets the lamp AND the body waking out of
  // shadow from a single value — the playground animates those as one envelope.
  const darkPalette = cameraPalette('idle', true);
  const litPalette = cameraPalette(milestone ? 'milestone' : 'active', true);

  const scale = (screenWidth * CAMERA_WIDTH_PCT) / CAMERA_WIDTH;
  const cameraWidth = CAMERA_WIDTH * scale;
  const cameraHeight = CAMERA_HEIGHT * scale;

  // The beam leaves the lens and sweeps LEFT, so its box runs full-bleed from
  // the screen edge and its NARROW end has to land exactly on the lamp. Derived
  // from where the camera actually sits rather than eyeballed, or the cone
  // detaches from the lens the moment the screen width changes.
  const cameraLeft =
    screenWidth * (1 - CAMERA_RIGHT_INSET_PCT) - cameraWidth;
  const beamWidth = Math.max(0, cameraLeft + cameraWidth * LENS_X_PCT);
  // The stage centres the camera, but the optical axis sits below the body's
  // middle — drop the beam by the difference so it is level with the lamp.
  const beamAxisOffset = cameraHeight * (LENS_AXIS_Y_PCT - 0.5);

  const litStyle = useAnimatedStyle(() => ({ opacity: light.value }));
  // The beam and the lens flash ride the same envelope at the preset's
  // intensity; the body cross-fade above runs to full.
  const beamStyle = useAnimatedStyle(() => ({
    opacity: light.value * HOUSE_CUT.lightIntensity,
  }));

  return (
    <View style={styles.stage} pointerEvents="none">
      <Animated.View
        style={[
          styles.beamLayer,
          { width: beamWidth, marginTop: -BEAM_HEIGHT / 2 + beamAxisOffset },
          beamStyle,
        ]}
      >
        <StreakBeam width={beamWidth} palette={litPalette} isDark />
      </Animated.View>

      {/* Three nested views, one transform each — see RN trap 04. */}
      <Animated.View style={[styles.rig, entranceStyle]}>
        <View style={styles.tilt}>
          <Animated.View style={shakeStyle}>
            <View style={{ transform: [{ scale }] }}>
              <StreakCamera palette={darkPalette} lit={false} celebrate={false} />
              <Animated.View style={[StyleSheet.absoluteFill, litStyle]}>
                <StreakCamera palette={litPalette} lit celebrate={milestone} />
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: CAMERA_HEIGHT * 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full-bleed left of the lens; marginTop is computed to the optical axis.
  beamLayer: {
    position: 'absolute',
    left: 0,
    height: BEAM_HEIGHT,
    top: '50%',
  },
  rig: {
    // Upper-right anchor with the lens carried over centre, per the spec's
    // camera placement.
    alignSelf: 'flex-end',
    marginRight: `${CAMERA_RIGHT_INSET_PCT * 100}%`,
  },
  tilt: { transform: [{ rotate: TILT_DEG }] },
});
