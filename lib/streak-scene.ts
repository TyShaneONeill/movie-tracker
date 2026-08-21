/**
 * PS-15 — the screening room's geometry.
 *
 * Every number the projector scene draws with is generated here, and almost
 * none of them are typed in. Two angles and a tilt produce the face matrix, the
 * depth sweep, the lens origin AND the direction the light leaves it. That last
 * pairing is the whole reason this file exists as a module rather than a few
 * constants in the component: a previous round derived the lens position but
 * hardcoded the beam angle, the two disagreed by 90°, and nobody caught it
 * until someone painted a box around the beam layer. Origin and direction now
 * come out of the same three numbers, so they cannot drift apart —
 * __tests__/lib/streak-scene.test.ts sweeps azimuth and asserts exactly that.
 *
 * Authored in the ORIGINAL 200×160 artwork space of camera-active.svg. No
 * coordinate in that file changes; the projection is applied on top of it, so
 * any revision to the artwork is inherited for free.
 *
 * Source of truth: docs/design/ps15-streak/BRIEF-projector-scene.md and the
 * interactive mock beside it. SCENE_CONTRACT below is the mock's Export panel,
 * verbatim — if it changes, re-copy from the Export panel rather than editing
 * numbers here by hand.
 */

/* ------------------------------------------------------------------ contract */

/** The scene is authored in this box. Everything below is in these units. */
export const SCENE_W = 390;
export const SCENE_H = 660;

/** Artwork space, verbatim from camera-active.svg. */
export const ARTWORK = { w: 200, h: 160 } as const;
/** The light source: 7.5% / 63% of the artwork. */
export const LENS = { x: 15, y: 101 } as const;
/** Tilt rotates about this artwork point, not about a bounding box. */
export const TILT_CENTRE = { x: 100, y: 100 } as const;

/**
 * Every knob the scene has. Plain `number` rather than the literal types an
 * `as const` would give, so a test can sweep azimuth through the contract type
 * without fighting it — which is the point of the suite.
 */
export interface SceneContract {
  /** φ — the object's own facing. 90 = pure profile; below turns the lens toward us. */
  azimuth: number;
  /** ε — the viewer's height above the floor. */
  elevation: number;
  /** τ — the projector being aimed, nose up. Rotates in the artwork's own plane. */
  tilt: number;
  /** f — −1 throws left. Cancels out of the depth sweep; lives in the matrix. */
  mirror: number;
  /** Body width, in artwork units of depth. */
  depth: number;
  /** Copies per volume in the extrusion. */
  steps: number;
  /** Atmospheric falloff — how far the far face is mixed toward the room's black. */
  haze: number;
  /** The camera's scale in the room, and where its tripod head sits. */
  cameraScale: number;
  cameraX: number;
  /** Half-angle of the throw. */
  spread: number;
  /** Lamp intensity at full lock. */
  intensity: number;
  /** Where the wall meets the floor. */
  horizon: number;
  tripod: number;
  /** Numeral: how far down the beam it sits, how big, and how far it extrudes. */
  numeralDistance: number;
  numeralSize: number;
  backlight: number;
}

/**
 * The signed-off contract. Reproduces the mock's Export panel exactly at these
 * values, which is the acceptance gate — see the brief's "The contract".
 */
export const SCENE_CONTRACT: SceneContract = {
  azimuth: 34,
  elevation: 8,
  tilt: -4,
  mirror: -1,
  depth: 47,
  steps: 13,
  haze: 0.3,
  cameraScale: 0.4,
  cameraX: 300,
  spread: 33,
  intensity: 0.76,
  horizon: 338,
  tripod: 90,
  numeralDistance: 124,
  numeralSize: 124,
  backlight: 0.39,
};

/* -------------------------------------------------------------------- matrix */

/**
 * An SVG `matrix(a,b,c,d,e,f)`. Mutable on purpose: react-native-svg's
 * `transform` prop takes ColumnMajorTransformMatrix, which is a mutable tuple,
 * and a readonly one will not assign to it.
 */
export type Mat = [number, number, number, number, number, number];

/** m ∘ n — n applied first, then m. Same order as nesting n inside m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(tx: number, ty: number): Mat {
  return [1, 0, 0, 1, tx, ty];
}

/** Rotation about an arbitrary centre, degrees, SVG's positive-is-clockwise. */
export function rotateAbout(deg: number, cx: number, cy: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return mul(mul(translate(cx, cy), [c, s, -s, c, 0, 0]), translate(-cx, -cy));
}

export function applyMat(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/* ---------------------------------------------------------------- projection */

/**
 * Two angles, not one. For a point (X along the artwork, Y across its depth,
 * Z down the artwork):
 *
 *   sx = f · (−X·sinφ + Y·cosφ)
 *   sy = −X·cosφ·sinε − Y·sinφ·sinε + Z·cosε
 *
 * `sx` has no Z term, so the near face collapses to one matrix and the depth
 * sweep to a constant local offset per unit.
 */
function trig(phiDeg: number, elevDeg: number, mirror: number) {
  const p = (phiDeg * Math.PI) / 180;
  const e = (elevDeg * Math.PI) / 180;
  return {
    sp: Math.sin(p),
    cp: Math.cos(p),
    se: Math.sin(e),
    ce: Math.cos(e),
    f: mirror,
  };
}

/** The near face's projection. The mirror lives here and nowhere else. */
export function faceMatrix(c: SceneContract): Mat {
  const a = trig(c.azimuth, c.elevation, c.mirror);
  return [-a.f * a.sp, -a.cp * a.se, 0, a.ce, 0, 0];
}

/**
 * Local (pre-matrix) offset per unit of depth. The mirror cancels out of both
 * terms, so the sweep never has to know which way the lens throws.
 */
export function depthStep(c: SceneContract): { u: number; v: number } {
  const a = trig(c.azimuth, c.elevation, c.mirror);
  return { u: -a.cp / a.sp, v: -(a.se / a.ce) / a.sp };
}

/** Tilt happens in artwork space, ahead of the projection. */
function tiltPoint(c: SceneContract, X: number, Z: number) {
  const t = (c.tilt * Math.PI) / 180;
  const cs = Math.cos(t);
  const sn = Math.sin(t);
  const dx = X - TILT_CENTRE.x;
  const dz = Z - TILT_CENTRE.y;
  return {
    X: TILT_CENTRE.x + dx * cs - dz * sn,
    Z: TILT_CENTRE.y + dx * sn + dz * cs,
  };
}

/** An artwork point, tilted then projected into scene coordinates. */
export function project(
  c: SceneContract,
  X: number,
  Y: number,
  Z: number,
): { x: number; y: number } {
  const a = trig(c.azimuth, c.elevation, c.mirror);
  const p = tiltPoint(c, X, Z);
  return {
    x: a.f * (-p.X * a.sp + Y * a.cp),
    y: -p.X * a.cp * a.se - Y * a.sp * a.se + p.Z * a.ce,
  };
}

/**
 * The direction the light leaves the lens, in radians of scene space.
 *
 * DERIVED. Forward is −X in artwork space, tilted by τ, then run through the
 * same projection that draws the body. There is deliberately no beam-angle
 * constant anywhere in this codebase: the lens cannot point one way while the
 * beam goes another, because both read these three numbers.
 */
export function beamAxis(c: SceneContract): number {
  const a = trig(c.azimuth, c.elevation, c.mirror);
  const t = (c.tilt * Math.PI) / 180;
  const dX = -Math.cos(t);
  const dZ = -Math.sin(t);
  return Math.atan2(-dX * a.cp * a.se + dZ * a.ce, a.f * (-dX * a.sp));
}

/** The projected bounds of a `w × h` artwork swept `depth` units back. */
export function boundsOf(
  c: SceneContract,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [X, Z] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    for (const Y of [0, c.depth]) {
      const q = project(c, X, Y, Z);
      xs.push(q.x);
      ys.push(q.y);
    }
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/* ------------------------------------------------------------------- volumes */

export interface Volume {
  id: string;
  fill: keyof CameraSolidFills;
  /** Fraction of the body's depth this part occupies. */
  depth: number;
  shape:
    | { kind: 'circle'; cx: number; cy: number; r: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };
}

export interface CameraSolidFills {
  reelB: string;
  reelA: string;
  body: string;
  arm: string;
  lens: string;
}

/** The five volumes that get extruded, verbatim from the mock's CAM_VOL. */
export const CAMERA_VOLUMES: readonly Volume[] = [
  {
    id: 'reelB',
    fill: 'reelB',
    depth: 0.42,
    shape: { kind: 'circle', cx: 156, cy: 46, r: 27 },
  },
  {
    id: 'reelA',
    fill: 'reelA',
    depth: 0.62,
    shape: { kind: 'circle', cx: 96, cy: 42, r: 32 },
  },
  {
    id: 'body',
    fill: 'body',
    depth: 1.0,
    shape: { kind: 'rect', x: 56, y: 62, w: 136, h: 84, rx: 24 },
  },
  {
    id: 'neck',
    fill: 'arm',
    depth: 0.68,
    shape: { kind: 'rect', x: 50, y: 78, w: 20, h: 40, rx: 8 },
  },
  {
    id: 'grip',
    fill: 'arm',
    depth: 0.68,
    shape: { kind: 'rect', x: 20, y: 86, w: 42, h: 30, rx: 8 },
  },
  {
    id: 'lens',
    fill: 'lens',
    depth: 0.68,
    shape: { kind: 'rect', x: 6, y: 80, w: 18, h: 42, rx: 9 },
  },
];

/* --------------------------------------------------------------------- shade */

function hex2rgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function rgb2hex(c: number[]): string {
  return (
    '#' +
    c
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  return rgb2hex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t));
}

/** The room's black. Everything far away is mixed toward it. */
export const ROOM_BLACK = '#09090b';

function luminance(h: string): number {
  const c = hex2rgb(h);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

/** The far face: light parts fall toward crimson, dark parts lift toward white. */
export function farShade(base: string): string {
  return luminance(base) > 0.68
    ? mixHex(base, '#4c0519', 0.26)
    : mixHex(base, '#ffffff', 0.19);
}

/* ------------------------------------------------------------------- derived */

export interface DerivedScene {
  face: Mat;
  step: { u: number; v: number };
  /** Radians and degrees of the throw. Derived — never authored. */
  axisRad: number;
  axisDeg: number;
  /** Where the lamp is, in scene coordinates. */
  lensX: number;
  lensY: number;
  /** Where the numeral lands: straight down the beam, no special case. */
  numeralX: number;
  numeralY: number;
  /** True when the projector is throwing at US rather than at the wall. */
  towardViewer: boolean;
  /** How far the cone is drawn — well past the numeral, so light doesn't stop at it. */
  reach: number;
  /** Half-angle of the throw, radians. */
  halfSpread: number;
  /** Unit vector of the projected depth axis — what the numeral extrudes along. */
  depthDir: { x: number; y: number };
  /** How far the numeral's extrude reaches, in scene units. */
  extrudeSpan: number;
  /** The camera's box in scene coordinates, and the viewBox that fills it. */
  camera: {
    left: number;
    top: number;
    width: number;
    height: number;
    viewBox: string;
  };
}

/**
 * The whole scene, from three angles and a contract.
 *
 * Read the field list above as the dependency graph: `axisRad` and `lensX/Y`
 * both fall out of `project`, which is why changing `azimuth` moves the beam
 * and its origin in lockstep.
 */
export function deriveScene(c: SceneContract = SCENE_CONTRACT): DerivedScene {
  const face = faceMatrix(c);
  const step = depthStep(c);
  const axisRad = beamAxis(c);
  const k = c.cameraScale;

  // Mounted by a fixed point on the body — the underside of the base plate,
  // artwork (124, 148) — never by a bounding box. A box moves every time the
  // tilt does, so box-mounting walks the camera off its own tripod.
  const mount = project(c, 124, c.depth * 0.5, 148);
  const footY = c.horizon + 38;
  const headY = footY - c.tripod;
  const camOX = c.cameraX - mount.x * k;
  const camOY = headY - 4 - mount.y * k;

  const lp = project(c, LENS.x, c.depth * 0.5, LENS.y);
  const lensX = camOX + lp.x * k;
  const lensY = camOY + lp.y * k;

  // The number simply sits IN the beam at a distance. No clamping and no
  // special case for "on the wall" versus "in the air": point the projector up
  // and it lands on the wall, point it at us and it floats in front of the
  // couch. One line either way is the only way it stays honest.
  const numeralX = lensX + Math.cos(axisRad) * c.numeralDistance;
  const numeralY = lensY + Math.sin(axisRad) * c.numeralDistance;
  const towardViewer = Math.sin(axisRad) > 0.15;

  // The projected depth axis, as a unit vector — one artwork unit of depth,
  // projected, normalised. This is what the numeral's backlight extrudes along,
  // so the number is a solid in the same world as the camera.
  const o = project(c, TILT_CENTRE.x, 0, TILT_CENTRE.y);
  const d = project(c, TILT_CENTRE.x, 1, TILT_CENTRE.y);
  const dl = Math.hypot(d.x - o.x, d.y - o.y) || 1;
  const depthDir = { x: (d.x - o.x) / dl, y: (d.y - o.y) / dl };

  const bb = boundsOf(c, ARTWORK.w, ARTWORK.h);

  return {
    face,
    step,
    axisRad,
    axisDeg: (axisRad * 180) / Math.PI,
    lensX,
    lensY,
    numeralX,
    numeralY,
    towardViewer,
    reach: c.numeralDistance * (towardViewer ? 2.6 : 1.5),
    halfSpread: (c.spread * Math.PI) / 180,
    depthDir,
    // 22 units at full backlight, scaled with the glyph so the offset stays
    // proportional to the number rather than to the scene.
    extrudeSpan: 22 * c.backlight * (c.numeralSize / 112),
    camera: {
      left: camOX + bb.x * k,
      top: camOY + bb.y * k,
      width: bb.w * k,
      height: bb.h * k,
      viewBox: `${bb.x} ${bb.y} ${bb.w} ${bb.h}`,
    },
  };
}

/* -------------------------------------------------------------------- layout */

export interface SceneLayout {
  /** Scene units → screen points. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * The widest the scene is ever drawn, in scene units.
 *
 * The app renders on web as well as on handsets, capped at a 768pt column, and
 * the takeover mounts full-bleed outside that column. Without a ceiling the
 * scene scales with the whole window: at 1440 the projector is drawn at 3.7×
 * and sits off the side of the screen entirely. 470 is a little past the widest
 * handset we ship to, so no phone is affected and a desktop window gets a
 * phone-sized room centred in it.
 */
export const SCENE_MAX_W = 470;

/**
 * Where the 390×660 scene lands on a real screen.
 *
 * FIT WIDTH, CENTRED — deliberately not the mock's `slice`. The mock runs in a
 * 390×660 phone frame where the two are identical; a real handset is ~390×850,
 * and covering that would crop a quarter of the width off the composition to
 * fill space the room does not need. Fitting the width preserves the frame
 * exactly and leaves a band top and bottom, which costs nothing because the
 * floor's far stop and the takeover's dim are both effectively the same
 * near-black — there is no seam to see. It also lands the numeral at ~48% of
 * the screen on every handset we ship to, and drops the CTA just below the
 * floor's bottom edge.
 *
 * Centring horizontally only matters once the width is capped, but it is what
 * keeps a wide window showing a room in the middle rather than a room pinned to
 * the left edge with the projector past the far side.
 */
export function sceneLayout(screenW: number, screenH: number): SceneLayout {
  const scale = Math.min(screenW, SCENE_MAX_W) / SCENE_W;
  return {
    scale,
    offsetX: (screenW - SCENE_W * scale) / 2,
    offsetY: (screenH - SCENE_H * scale) / 2,
  };
}

/** A scene point in screen coordinates. */
export function toScreen(l: SceneLayout, x: number, y: number): { x: number; y: number } {
  return { x: l.offsetX + x * l.scale, y: l.offsetY + y * l.scale };
}
