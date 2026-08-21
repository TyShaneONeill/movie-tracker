/**
 * PS-15 v2 — the celebration takeover's STAGE: the screening room.
 *
 * A projector on a tripod throws a beam across a dark room; the streak numeral
 * sits in that beam, in front of a couch, landing on the phone's own glass. The
 * geometry is an axonometric projection of the SAME 200×160 artwork the flat
 * hero draws (docs/design/ps15-streak/design_handoff_streak_camera/assets/
 * camera-active.svg) — no coordinate in that file changes, so any revision to
 * the artwork is inherited. Spec: docs/design/ps15-streak/BRIEF-projector-scene.md
 * and scene-acceptance-mock.html beside it.
 *
 * It owns no animation and no timing, exactly as the interim stage did not. The
 * takeover drives every value and hands them down, so the House Cut contract and
 * one-cancelAnimation skip survive the swap untouched:
 *
 *   entranceStyle — the rig's pop-and-settle. Applied to the camera's OWN box,
 *                   never the scene's, so the pop scales about the projector
 *                   rather than about the middle of the room.
 *   shakeStyle    — the motor catching. An INNER view; per RN trap 04 neither RN
 *                   nor CSS composes two transforms on one node. The scene needs
 *                   only two nested views, not the interim's three, because the
 *                   −4° tilt is now part of the projection rather than a static
 *                   RN rotate.
 *   light         — 0 dark → 1 beam locked, stuttering on the way.
 *   flicker       — the lamp's own 4.3s gutter, running under all of it.
 *
 * light × flicker is ONE number and it drives the beam, the lens bloom and (up
 * in the takeover) the numeral together — brief trap 6. A beam that stutters
 * while its own glow holds steady reads as two separate lights.
 *
 * WHAT IS RASTER AND WHAT IS LIVE (brief trap 3). Wall, floor, rug, couch and
 * tripod are one exported plate, assets/images/streak-room.png, because vector
 * for the room buys nothing and costs a few hundred nodes on every open. Only
 * the camera solid, the beam, the lens bloom and the vignette are drawn live —
 * and the brief's paint order is what makes a single plate possible, since it
 * puts the beam AFTER the tripod rather than between the couch and it.
 *
 * NO FILTERS ANYWHERE (brief traps 1 and 2). feGaussianBlur is unreliable on
 * Android in react-native-svg and cost PR #833 a round. Every soft edge here is
 * geometry and gradients: the cone is a stack of nested wedges whose per-wedge
 * alpha tapers to nothing at the rim, and the lens bloom is a radial gradient.
 * The stack was fitted against the mock's own blurred cone offline — see
 * BEAM_FIT below. Do not "improve" any of it into a blur.
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { cameraPalette, type CameraPalette } from '@/constants/streak-theme';
import {
  CAMERA_VOLUMES,
  ROOM_BLACK,
  SCENE_CONTRACT,
  SCENE_H,
  SCENE_W,
  TILT_CENTRE,
  deriveScene,
  depthStep,
  farShade,
  mixHex,
  mul,
  rotateAbout,
  sceneLayout,
  translate,
  type Mat,
} from '@/lib/streak-scene';

/** Wall, floor, rug, couch, tripod — rendered from the mock at 3×, one plate. */
const ROOM_PLATE = require('@/assets/images/streak-room.png');

/**
 * The filter-free cone, fitted offline against the mock's own blurred original
 * (stdDeviation 15 on the cone, 5 on the core) by minimising RMS error over the
 * beam's neighbourhood. Landed at 2.92/255 ≈ 1.1%.
 *
 * `taper` is the reason it works: equal-alpha wedges leave the outermost one
 * with a hard, visible edge against a near-black room, so the per-wedge alpha
 * falls to zero at the rim and the cone has no boundary to see.
 */
const BEAM_FIT = {
  cone: { count: 14, spread: 1.3, taper: 1.0, alpha: 0.3 },
  core: { count: 4, spread: 0.35, taper: 3.6, alpha: 0.25 },
  bloom: { radius: 56, peak: 0.09, mid: 0.5 },
} as const;

/** The hot centre of the lamp, straight off the mock. */
const LAMP_DOT_R = 6 * SCENE_CONTRACT.intensity * 0.5 + 2;

export interface TakeoverStageProps {
  entranceStyle: AnimatedStyle<ViewStyle>;
  shakeStyle: AnimatedStyle<ViewStyle>;
  /** 0 dark → 1 beam locked. The sequence owns this. */
  light: SharedValue<number>;
  /** The lamp's ambient gutter, 0.55–1. Pinned at 1 under Reduce Motion. */
  flicker: SharedValue<number>;
  milestone: boolean;
  screenWidth: number;
  screenHeight: number;
}

export function TakeoverStage({
  entranceStyle,
  shakeStyle,
  light,
  flicker,
  milestone,
  screenWidth,
  screenHeight,
}: TakeoverStageProps) {
  // The room is authored dark and stays dark in both themes — see the PR. The
  // celebration dims the house lights either way, and a lit projector in a lit
  // room is not a thing.
  const palette = cameraPalette(milestone ? 'milestone' : 'active', true);
  // The same body in shadow. `light` cross-fades the lit copy over it so the
  // projector wakes out of the dark WITH its own lamp — the interim stage did
  // this and the contract names it ("the lamp, the beam and the body waking up
  // together"). Without it the projector sits there fully lit with no beam
  // coming out of it for the first second and a half, which reads as broken.
  const shadowPalette = cameraPalette('idle', true);
  const scene = React.useMemo(() => deriveScene(), []);
  const layout = React.useMemo(
    () => sceneLayout(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );

  const sceneBox = {
    position: 'absolute' as const,
    left: layout.offsetX,
    top: layout.offsetY,
    width: SCENE_W * layout.scale,
    height: SCENE_H * layout.scale,
  };

  // The camera gets its own box so the entrance's `scale` pivots on the
  // projector. Scaling the scene-sized layer instead would swing the camera in
  // from the middle of the room.
  const cam = scene.camera;
  const cameraBox = {
    position: 'absolute' as const,
    left: layout.offsetX + cam.left * layout.scale,
    top: layout.offsetY + cam.top * layout.scale,
    width: cam.width * layout.scale,
    height: cam.height * layout.scale,
  };

  // One value. The beam and its own bloom cannot disagree (trap 6).
  const lampStyle = useAnimatedStyle(() => ({
    opacity: light.value * flicker.value,
  }));
  // The body wakes on `light` alone, not on the gutter: a projector's casing
  // does not go dark every time the lamp stutters, only its light does.
  const litBodyStyle = useAnimatedStyle(() => ({ opacity: light.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 1 wall · 2 floor, rug · 3 couch · 4a tripod */}
      <Image source={ROOM_PLATE} style={sceneBox} resizeMode="stretch" />

      {/* 4b the camera solid, in shadow with the lit copy fading in over it */}
      <Animated.View style={[cameraBox, entranceStyle]}>
        <Animated.View style={shakeStyle}>
          <CameraSolid
            idPrefix="dark"
            palette={shadowPalette}
            width={cameraBox.width}
            height={cameraBox.height}
            viewBox={cam.viewBox}
          />
          <Animated.View style={[StyleSheet.absoluteFill, litBodyStyle]}>
            <CameraSolid
              idPrefix="lit"
              palette={palette}
              width={cameraBox.width}
              height={cameraBox.height}
              viewBox={cam.viewBox}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* 5 the beam · 6 the lens bloom */}
      <Animated.View style={[sceneBox, lampStyle]}>
        <Beam palette={palette} width={sceneBox.width} height={sceneBox.height} />
      </Animated.View>

      {/* 7 the vignette. Paints BEFORE the numeral, which the takeover draws on
          top of this whole layer: the number is landing on the glass, nearer
          than the room, so the room's falloff must not dim it. Full-screen
          rather than scene-sized so the band above and below the plate falls off
          on the same curve. */}
      <View style={StyleSheet.absoluteFill}>
        <Vignette
          width={screenWidth}
          height={screenHeight}
          cx={layout.offsetX + (SCENE_W / 2) * layout.scale}
          cy={layout.offsetY + 300 * layout.scale}
          r={400 * layout.scale}
        />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- the camera */

/**
 * The projector as a solid: every volume emitted as `steps` stacked copies from
 * far to near, all sharing ONE gradient running along the sweep vector, so the
 * shading reads as a lit surface instead of per-step banding.
 *
 * Each copy carries a single matrix rather than two nested groups, because
 * translate ∘ rotate(τ, C) is the same as rotate(τ, C + offset) ∘ translate —
 * pinned in __tests__/lib/streak-scene.test.ts.
 */
function CameraSolid({
  idPrefix,
  palette,
  width,
  height,
  viewBox,
}: {
  /**
   * Namespaces the gradient ids. The shadow copy and the lit one are two
   * separate <Svg> roots with identical geometry, and leaving them to fight over
   * the same `solid-body` is not a bet worth taking on Android.
   */
  idPrefix: string;
  palette: CameraPalette;
  width: number;
  height: number;
  viewBox: string;
}) {
  const c = SCENE_CONTRACT;
  const step = depthStep(c);
  const face = deriveScene().face;
  const tilt = rotateAbout(c.tilt, TILT_CENTRE.x, TILT_CENTRE.y);

  // The gradient lives in the shape's own TILTED space, so its vector has to be
  // counter-rotated by −τ or the shading runs across the volume instead of down it.
  const tr = (-c.tilt * Math.PI) / 180;
  const ct = Math.cos(tr);
  const sn = Math.sin(tr);

  const fills: Record<string, string> = {
    reelA: palette.reelA,
    reelB: palette.reelB,
    body: palette.body,
    arm: palette.lens,
    lens: palette.face,
  };

  const gradients: React.ReactNode[] = [];
  const solids: React.ReactNode[] = [];

  CAMERA_VOLUMES.forEach((v) => {
    const d = c.depth * v.depth;
    const base = fills[v.fill];
    const far = mixHex(farShade(base), ROOM_BLACK, c.haze * 0.3);
    const rim = mixHex(far, ROOM_BLACK, 0.42);
    const gid = `${idPrefix}-${v.id}`;
    const gx = step.u * d;
    const gy = step.v * d;

    gradients.push(
      <LinearGradient
        key={gid}
        id={gid}
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2={gx * ct - gy * sn}
        y2={gx * sn + gy * ct}
      >
        <Stop offset="0" stopColor={base} />
        <Stop offset="1" stopColor={far} />
      </LinearGradient>,
    );

    // Far face first — an outline copy that gives the volume its edge — then the
    // stack sweeping home to zero offset.
    const copies: { t: number; fill: string; stroke?: string }[] = [
      { t: 1, fill: far, stroke: rim },
    ];
    for (let i = c.steps; i >= 1; i--)
      copies.push({ t: i / c.steps, fill: `url(#${gid})` });

    copies.forEach((copy, i) => {
      const m = mul(translate(step.u * d * copy.t, step.v * d * copy.t), tilt);
      solids.push(
        <VolumeShape
          key={`${gid}-${i}`}
          volume={v}
          matrix={m}
          fill={copy.fill}
          stroke={copy.stroke}
        />,
      );
    });
  });

  return (
    <Svg width={width} height={height} viewBox={viewBox} pointerEvents="none">
      <Defs>{gradients}</Defs>
      <G transform={face}>
        {solids}
        {/* The near face, tilted inside the matrix — the parent applies the shear. */}
        <G transform={tilt}>
          <CameraFace palette={palette} />
        </G>
      </G>
    </Svg>
  );
}

function VolumeShape({
  volume,
  matrix,
  fill,
  stroke,
}: {
  volume: (typeof CAMERA_VOLUMES)[number];
  matrix: Mat;
  fill: string;
  stroke?: string;
}) {
  const s = volume.shape;
  const edge = stroke ? { stroke, strokeWidth: 2.5 } : null;
  if (s.kind === 'circle') {
    return (
      <Circle cx={s.cx} cy={s.cy} r={s.r} fill={fill} transform={matrix} {...edge} />
    );
  }
  return (
    <Rect
      x={s.x}
      y={s.y}
      width={s.w}
      height={s.h}
      rx={s.rx}
      fill={fill}
      transform={matrix}
      {...edge}
    />
  );
}

/**
 * The near face, in the artwork's own coordinates — identical geometry to the
 * flat hero's StreakCamera, which is the point: one drawing, two projections.
 *
 * spoolA / spoolB are named groups with their own rotation about their reel
 * centres, INSIDE the matrix, so the parent's shear does not have to be
 * re-solved to turn them (brief trap 8). They are held at rest here: this
 * codebase has no precedent for driving a react-native-svg transform off a
 * Reanimated value, and a visual-swap PR is the wrong place to take that on
 * unverified. The spin-up beat still reads through the 2px shake, exactly as it
 * ships today.
 */
function CameraFace({ palette }: { palette: CameraPalette }) {
  const spoolB = rotateAbout(0, 156, 46);
  const spoolA = rotateAbout(0, 96, 42);
  return (
    <G>
      <Circle cx="156" cy="46" r="27" fill={palette.reelB} />
      <Circle cx="156" cy="46" r="17" fill={palette.reelIn} />
      <G id="spoolB" transform={spoolB}>
        <Circle cx="156" cy="37.5" r="4.5" fill={palette.holes} />
        <Circle cx="148.6" cy="50.25" r="4.5" fill={palette.holes} />
        <Circle cx="163.4" cy="50.25" r="4.5" fill={palette.holes} />
      </G>
      <Circle cx="156" cy="46" r="3" fill={palette.holes} />

      <Circle cx="96" cy="42" r="32" fill={palette.reelA} />
      <Circle cx="96" cy="42" r="20" fill={palette.reelIn} />
      <G id="spoolA" transform={spoolA}>
        <Circle cx="96" cy="32" r="5" fill={palette.holes} />
        <Circle cx="87.3" cy="47" r="5" fill={palette.holes} />
        <Circle cx="104.7" cy="47" r="5" fill={palette.holes} />
      </G>
      <Circle cx="96" cy="42" r="3.5" fill={palette.holes} />

      <Rect x="56" y="62" width="136" height="84" rx="24" fill={palette.body} />
      <Rect x="104" y="78" width="64" height="46" rx="13" fill={palette.mount} />
      <Rect x="116" y="89" width="40" height="7" rx="3.5" fill={palette.body} />
      <Rect x="116" y="102" width="40" height="7" rx="3.5" fill={palette.body} />
      <Rect x="56" y="118" width="136" height="28" rx="14" fill={palette.bodySh} />
      <Circle cx="172" cy="128" r="6" fill={palette.dotc} />
      <Rect x="50" y="78" width="20" height="40" rx="8" fill={palette.lens} />
      <Rect x="20" y="86" width="42" height="30" rx="8" fill={palette.lens} />
      <Rect x="6" y="80" width="18" height="42" rx="9" fill={palette.face} />
    </G>
  );
}

/* ---------------------------------------------------------------- the beam */

/**
 * The throw and the lamp, in scene coordinates.
 *
 * Both gradients run from the lens to the numeral, so the light dies exactly
 * where the number is even though the cone geometry is drawn well past it —
 * that is what stops the beam looking like it terminates on the glyph.
 *
 * stopColor and stopOpacity are separate on every stop: react-native-svg drops
 * the alpha channel of an `rgba()` stopColor and paints the cone fully opaque,
 * which is a bright wedge rather than a beam.
 */
function Beam({
  palette,
  width,
  height,
}: {
  palette: CameraPalette;
  width: number;
  height: number;
}) {
  const s = deriveScene();
  const I = SCENE_CONTRACT.intensity;
  const warm = palette.sceneWarm;

  const point = (offset: number) => ({
    x: s.lensX + Math.cos(s.axisRad + offset) * s.reach,
    y: s.lensY + Math.sin(s.axisRad + offset) * s.reach,
  });

  const stack = (
    key: string,
    fit: { count: number; spread: number; taper: number; alpha: number },
    gradient: string,
  ) => {
    const out: React.ReactNode[] = [];
    // Widest first, so the narrow bright wedges land on top of the soft ones.
    for (let j = fit.count - 1; j >= 0; j--) {
      const alpha = fit.alpha * Math.pow(1 - j / fit.count, fit.taper);
      if (alpha < 0.0015) continue;
      const h = s.halfSpread * fit.spread * ((j + 1) / fit.count);
      const a = point(-h);
      const b = point(h);
      out.push(
        <Path
          key={`${key}${j}`}
          d={`M${s.lensX} ${s.lensY} L${a.x} ${a.y} L${b.x} ${b.y} Z`}
          fill={`url(#${gradient})`}
          fillOpacity={alpha}
        />,
      );
    }
    return out;
  };

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient
          id="beamCone"
          gradientUnits="userSpaceOnUse"
          x1={s.lensX}
          y1={s.lensY}
          x2={s.numeralX}
          y2={s.numeralY}
        >
          <Stop offset="0" stopColor={warm} stopOpacity={0.5 * I} />
          <Stop offset="0.5" stopColor={warm} stopOpacity={0.2 * I} />
          <Stop offset="1" stopColor={warm} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient
          id="beamCore"
          gradientUnits="userSpaceOnUse"
          x1={s.lensX}
          y1={s.lensY}
          x2={s.numeralX}
          y2={s.numeralY}
        >
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.75 * I} />
          <Stop offset="0.4" stopColor={warm} stopOpacity={0.3 * I} />
          <Stop offset="1" stopColor={warm} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient
          id="lensBloom"
          gradientUnits="userSpaceOnUse"
          cx={s.lensX}
          cy={s.lensY}
          rx={BEAM_FIT.bloom.radius}
          ry={BEAM_FIT.bloom.radius}
        >
          <Stop offset="0" stopColor={warm} stopOpacity={BEAM_FIT.bloom.peak} />
          <Stop
            offset="0.35"
            stopColor={warm}
            stopOpacity={BEAM_FIT.bloom.peak * BEAM_FIT.bloom.mid}
          />
          <Stop
            offset="0.70"
            stopColor={warm}
            stopOpacity={BEAM_FIT.bloom.peak * BEAM_FIT.bloom.mid * 0.3}
          />
          <Stop offset="1" stopColor={warm} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {stack('cone', BEAM_FIT.cone, 'beamCone')}
      {stack('core', BEAM_FIT.core, 'beamCore')}

      <Circle
        cx={s.lensX}
        cy={s.lensY}
        r={BEAM_FIT.bloom.radius}
        fill="url(#lensBloom)"
      />
      <Circle
        cx={s.lensX}
        cy={s.lensY}
        r={LAMP_DOT_R}
        fill="#ffffff"
        fillOpacity={0.9 * I}
      />
    </Svg>
  );
}

/* ------------------------------------------------------------ the vignette */

function Vignette({
  width,
  height,
  cx,
  cy,
  r,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  r: number;
}) {
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient
          id="vig"
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={cy}
          rx={r}
          ry={r}
        >
          <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.72} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#vig)" />
    </Svg>
  );
}
