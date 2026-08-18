/**
 * The streak hero's film camera, its projector beam, and light mode's stage
 * wash — the three pieces that sit behind and around the streak numeral.
 *
 * Geometry is the handoff's baked SVG (docs/design/ps15-streak/
 * design_handoff_streak_camera/assets/camera-*.svg): viewBox 0 0 200 160, lens
 * pointing left, optical axis at y=100, thirteen parts in paint order. Nothing
 * is redrawn per state — one tree wears three palettes (constants/streak-theme).
 *
 * Part 13 is the hidden lamp inside the lens; the beam appears to come from it.
 * v1 renders static: reel rotation and the transition fade are v2.
 */

import React from 'react';
import Svg, {
  Circle,
  Defs,
  FeDropShadow,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import type { CameraPalette } from '@/constants/streak-theme';
import type { StreakHeroState } from '@/lib/streak-view';

export const CAMERA_WIDTH = 170;
export const CAMERA_HEIGHT = 136;
export const HERO_HEIGHT = 210;
/** Beam box: full-bleed left, stopping ~5px inside the lens barrel on the right. */
export const BEAM_RIGHT_INSET = 172;
export const BEAM_HEIGHT = 150;

export function StreakCamera({
  palette,
  lit,
  celebrate,
}: {
  palette: CameraPalette;
  /** Active or milestone — the lamp inside the lens is on. */
  lit: boolean;
  /** Milestone — the ring and sparks paint. */
  celebrate: boolean;
}) {
  const glow = palette.camGlow;
  return (
    <Svg
      width={CAMERA_WIDTH}
      height={CAMERA_HEIGHT}
      viewBox="0 0 200 160"
      // The drop shadow and the lamp blur both paint outside the viewBox.
      pointerEvents="none"
    >
      <Defs>
        {glow ? (
          <Filter id="camGlow" x="-35%" y="-35%" width="170%" height="170%">
            <FeDropShadow dx="0" dy="6" stdDeviation="12" floodColor={glow} floodOpacity="1" />
          </Filter>
        ) : null}
        <Filter id="haloBlur" x="-120%" y="-120%" width="340%" height="340%">
          <FeGaussianBlur stdDeviation="7" />
        </Filter>
        <Filter id="flareBlur" x="-60%" y="-300%" width="220%" height="700%">
          <FeGaussianBlur stdDeviation="3" />
        </Filter>
      </Defs>

      <G filter={glow ? 'url(#camGlow)' : undefined}>
        {/* 1 · milestone ring, 2 · sparks */}
        {celebrate && (
          <G>
            <Circle cx="118" cy="84" r="72" fill="none" stroke={palette.ring} strokeWidth="3" />
            <Path d="M52 10 L58 16 L52 22 L46 16 Z" fill={palette.spark} />
            <Path d="M190 46 L195 51 L190 56 L185 51 Z" fill={palette.spark} />
            <Path d="M44 128 L49 133 L44 138 L39 133 Z" fill={palette.spark} />
            <Circle cx="152" cy="4" r="3" fill={palette.spark} />
            <Circle cx="196" cy="120" r="2.5" fill={palette.spark} />
          </G>
        )}

        {/* 3 · back reel */}
        <Circle cx="156" cy="46" r="27" fill={palette.reelB} />
        <Circle cx="156" cy="46" r="17" fill={palette.reelIn} />
        <Circle cx="156" cy="37.5" r="4.5" fill={palette.holes} />
        <Circle cx="148.6" cy="50.25" r="4.5" fill={palette.holes} />
        <Circle cx="163.4" cy="50.25" r="4.5" fill={palette.holes} />
        <Circle cx="156" cy="46" r="3" fill={palette.holes} />

        {/* 4 · front reel */}
        <Circle cx="96" cy="42" r="32" fill={palette.reelA} />
        <Circle cx="96" cy="42" r="20" fill={palette.reelIn} />
        <Circle cx="96" cy="32" r="5" fill={palette.holes} />
        <Circle cx="87.3" cy="47" r="5" fill={palette.holes} />
        <Circle cx="104.7" cy="47" r="5" fill={palette.holes} />
        <Circle cx="96" cy="42" r="3.5" fill={palette.holes} />

        {/* 5 · body, 6 · vent panel under the band, 7 · slats punched through */}
        <Rect x="56" y="62" width="136" height="84" rx="24" fill={palette.body} />
        <Rect x="104" y="78" width="64" height="46" rx="13" fill={palette.mount} />
        <Rect x="116" y="89" width="40" height="7" rx="3.5" fill={palette.body} />
        <Rect x="116" y="102" width="40" height="7" rx="3.5" fill={palette.body} />

        {/* 8 · bottom band */}
        <Rect x="56" y="118" width="136" height="28" rx="14" fill={palette.bodySh} />

        {/* 9 · collar, 10 · barrel, 11 · lens face */}
        <Rect x="50" y="78" width="20" height="40" rx="8" fill={palette.lens} />
        <Rect x="20" y="86" width="42" height="30" rx="8" fill={palette.lens} />
        <Rect x="6" y="80" width="18" height="42" rx="9" fill={palette.face} />

        {/* 12 · record dot */}
        <Circle cx="172" cy="128" r="6" fill={palette.dotc} />
      </G>

      {/* 13 · the hidden light source — outside the glow filter so the lamp
          isn't shadowed by it */}
      {lit && (
        <G>
          <Circle cx="15" cy="101" r="13" fill={palette.glowHalo} filter="url(#haloBlur)" />
          <Circle cx="15" cy="101" r="6" fill="#ffffff" />
          <Rect
            x="0"
            y="99"
            width="32"
            height="4"
            rx="2"
            fill="#ffffff"
            opacity={0.85}
            filter="url(#flareBlur)"
          />
        </G>
      )}
    </Svg>
  );
}

/**
 * The beam: two layers behind the camera and under the numeral. Layer 1 is the
 * cone, layer 2 a hot white core. Both are a 150px-tall box whose narrow end
 * sits on the lens axis. Light mode drops the core — on a white card it can
 * only dilute the cone exactly where the founder's is hottest — and repaints
 * the cone at higher saturation with a linear falloff.
 */
export function StreakBeam({
  width,
  palette,
  isDark,
}: {
  width: number;
  palette: CameraPalette;
  isDark: boolean;
}) {
  if (width <= 0) return null;
  const h = BEAM_HEIGHT;
  const cone = `${width},${h * 0.45} ${width},${h * 0.55} 0,0 0,${h}`;
  const core = `${width},${h * 0.47} ${width},${h * 0.53} 0,${h * 0.26} 0,${h * 0.74}`;

  // Dark keeps the handoff's two stops plus a tail; light falls off almost
  // linearly from the lens to the far edge, a different curve, so it skips the
  // mid stop entirely.
  const coneStops = [
    <Stop key="a" offset="0" stopColor={palette.beam} stopOpacity={palette.beamAlphaA} />,
    ...(isDark
      ? [<Stop key="b" offset="0.55" stopColor={palette.beam} stopOpacity={palette.beamAlphaB} />]
      : []),
    <Stop key="c" offset={palette.beamFalloff} stopColor={palette.beam} stopOpacity="0" />,
  ];

  return (
    <Svg width={width} height={h} pointerEvents="none">
      <Defs>
        <LinearGradient id="beamCone" x1={width} y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          {coneStops}
        </LinearGradient>
        <LinearGradient id="beamCore" x1={width} y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <Stop offset="0.72" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <Filter id="coneBlur" x="-10%" y="-20%" width="120%" height="140%">
          <FeGaussianBlur stdDeviation={isDark ? '2' : '3'} />
        </Filter>
        <Filter id="coreBlur" x="-15%" y="-40%" width="130%" height="180%">
          <FeGaussianBlur stdDeviation="7" />
        </Filter>
      </Defs>

      <Polygon points={cone} fill="url(#beamCone)" filter="url(#coneBlur)" />
      {isDark && <Polygon points={core} fill="url(#beamCore)" filter="url(#coreBlur)" />}
    </Svg>
  );
}

/**
 * Light mode's stage wash: a barely-there warm radial under a lit hero only.
 *
 * STRICTLY bounded by the hero. An earlier round let it overshoot by 26px top
 * and bottom and it tinted the tabs pill above and the message card below —
 * founder-caught. The box is the hero's own bounds and a vertical mask fades
 * the wash to zero before it reaches them, so the clip has no edge to see.
 */
export function StreakStageWash({
  width,
  height,
  state,
}: {
  width: number;
  height: number;
  state: StreakHeroState;
}) {
  if (width <= 0) return null;
  // Half a stop stronger and distinctly yellower at a milestone — the wash is
  // the room answering the beam, not a fixed tint.
  const mile = state === 'milestone';
  const rgb = mile ? '245,172,30' : '240,168,72';
  const peak = mile ? 0.183 : 0.163;
  const mid = mile ? 0.11 : 0.098;

  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        {/* A 230px horizontal radius against a 400px vertical one — the wash
            falls off across the card and stays almost flat down it. Anything
            rounder peaks visibly under the numeral and stops being a stage. */}
        <RadialGradient
          id="washFill"
          cx={width * 0.66}
          cy={height / 2}
          rx="230"
          ry="400"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={peak} />
          <Stop offset="0.45" stopColor={`rgb(${rgb})`} stopOpacity={mid} />
          <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity="0" />
        </RadialGradient>
        {/* 22% of the hero at each end ≈ 46px of fade: long enough to take the
            wash to zero without a band, and the middle 56% is untouched. */}
        <LinearGradient id="washMask" x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset="0.22" stopColor="#fff" stopOpacity="1" />
          <Stop offset="0.78" stopColor="#fff" stopOpacity="1" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="washClip">
          <Rect x="0" y="0" width={width} height={height} fill="url(#washMask)" />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#washFill)" mask="url(#washClip)" />
    </Svg>
  );
}
