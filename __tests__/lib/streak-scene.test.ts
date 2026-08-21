/**
 * PS-15 — the screening room's geometry.
 *
 * The suite exists for one assertion above all others, and the brief names it:
 * the beam's ORIGIN and its DIRECTION must both fall out of (φ, ε, τ), so that
 * changing the azimuth moves the two together. Round 2 shipped a beam that
 * fired 90° off its own lens precisely because the direction was a constant
 * while the origin was derived, and nothing caught it until the layer was
 * painted green on a device. `points where the lens points` below is the test
 * that would have.
 *
 * The contract block is the mock's Export panel verbatim
 * (docs/design/ps15-streak/scene-acceptance-mock.html). If it ever disagrees
 * with this file, the mock is right.
 */

import {
  ARTWORK,
  LENS,
  SCENE_CONTRACT,
  SCENE_H,
  SCENE_W,
  beamAxis,
  depthStep,
  deriveScene,
  faceMatrix,
  farShade,
  mixHex,
  mul,
  project,
  rotateAbout,
  sceneLayout,
  toScreen,
  translate,
  type SceneContract,
} from '@/lib/streak-scene';

/** The contract with one field overridden — every other number held still. */
function at(over: Partial<SceneContract>): SceneContract {
  return { ...SCENE_CONTRACT, ...over };
}

/** The angle, in degrees, from one scene point to another. */
function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

describe('streak scene — the contract', () => {
  it('reproduces the mock Export panel at the signed-off values', () => {
    const m = faceMatrix(SCENE_CONTRACT);
    // matrix(0.55919,-0.11538,0,0.99027,0,0)
    expect(m[0]).toBeCloseTo(0.55919, 5);
    expect(m[1]).toBeCloseTo(-0.11538, 5);
    expect(m[2]).toBe(0);
    expect(m[3]).toBeCloseTo(0.99027, 5);
    expect(m[4]).toBe(0);
    expect(m[5]).toBe(0);

    const s = depthStep(SCENE_CONTRACT);
    expect(s.u).toBeCloseTo(-1.4826, 4);
    expect(s.v).toBeCloseTo(-0.2513, 4);

    expect(deriveScene().axisDeg).toBeCloseTo(161.7, 1);
  });

  it('places the lamp, the number and the camera where the mock places them', () => {
    // Sampled out of the mock itself at the contract values, not eyeballed —
    // these are the pixel gate the device screenshots get compared against.
    const d = deriveScene();
    expect(d.lensX).toBeCloseTo(274.945, 3);
    expect(d.lensY).toBeCloseTo(271.61, 3);
    expect(d.numeralX).toBeCloseTo(157.197, 3);
    expect(d.numeralY).toBeCloseTo(310.486, 3);
    expect(d.extrudeSpan).toBeCloseTo(9.4993, 4);
    expect(d.depthDir.x).toBeCloseTo(-0.99562, 5);
    expect(d.depthDir.y).toBeCloseTo(-0.09346, 5);
  });

  it('puts the lamp at 7.5% / 63% of the artwork', () => {
    expect(LENS.x / ARTWORK.w).toBeCloseTo(0.075, 4);
    expect(LENS.y / ARTWORK.h).toBeCloseTo(0.63, 2);
  });

  it('throws toward the viewer, so the number floats in front of the couch', () => {
    const d = deriveScene();
    expect(d.towardViewer).toBe(true);
    // Down-frame and to the left: the light is coming at us, not at the wall.
    expect(Math.sin(d.axisRad)).toBeGreaterThan(0.15);
    expect(Math.cos(d.axisRad)).toBeLessThan(0);
  });

  it('lands the numeral exactly `numeralDistance` down the beam from the lamp', () => {
    const d = deriveScene();
    const along = Math.hypot(d.numeralX - d.lensX, d.numeralY - d.lensY);
    expect(along).toBeCloseTo(SCENE_CONTRACT.numeralDistance, 6);
    expect(
      angleBetween({ x: d.lensX, y: d.lensY }, { x: d.numeralX, y: d.numeralY }),
    ).toBeCloseTo(d.axisDeg, 6);
  });

  it('keeps the whole frame inside the scene box', () => {
    const d = deriveScene();
    expect(d.lensX).toBeGreaterThan(0);
    expect(d.lensX).toBeLessThan(SCENE_W);
    expect(d.numeralX).toBeGreaterThan(0);
    expect(d.numeralY).toBeLessThan(SCENE_H);
    expect(d.camera.left).toBeGreaterThan(0);
    expect(d.camera.left + d.camera.width).toBeLessThanOrEqual(SCENE_W);
  });
});

/* ------------------------------------------------------------------------- */
/* The assertion the brief asks for by name.                                  */
/* ------------------------------------------------------------------------- */

describe('streak scene — beam origin and direction are derived together', () => {
  const SWEEP = [34, 42, 55, 68, 80, 90];

  it('points where the lens points, at every azimuth', () => {
    // The beam direction, cross-checked against the projected direction of the
    // lens barrel itself — two points along the artwork's own forward axis
    // (−X), tilted and projected by the SAME function that draws the body. If a
    // beam angle were ever hardcoded, this is the assertion that breaks.
    for (const azimuth of SWEEP) {
      const c = at({ azimuth });
      const here = project(c, LENS.x, c.depth * 0.5, LENS.y);
      const ahead = project(c, LENS.x - 10, c.depth * 0.5, LENS.y);
      const barrel = angleBetween(here, ahead);
      const beam = (beamAxis(c) * 180) / Math.PI;
      expect(beam).toBeCloseTo(barrel, 9);
    }
  });

  it('moves the origin AND the direction when azimuth changes', () => {
    const seen = SWEEP.map((azimuth) => {
      const d = deriveScene(at({ azimuth }));
      return { azimuth, x: d.lensX, y: d.lensY, deg: d.axisDeg };
    });

    for (let i = 1; i < seen.length; i++) {
      const prev = seen[i - 1];
      const next = seen[i];
      // Both, every step. Either one holding still is the bug.
      expect(Math.hypot(next.x - prev.x, next.y - prev.y)).toBeGreaterThan(0.5);
      expect(Math.abs(next.deg - prev.deg)).toBeGreaterThan(0.5);
    }
  });

  it('carries the numeral with the beam, rather than shoving it to meet one', () => {
    // Whatever the azimuth, the number is still exactly on the axis. This is
    // what "one line, no special case" buys.
    for (const azimuth of SWEEP) {
      const d = deriveScene(at({ azimuth }));
      expect(
        angleBetween({ x: d.lensX, y: d.lensY }, { x: d.numeralX, y: d.numeralY }),
      ).toBeCloseTo(d.axisDeg, 6);
    }
  });

  it('moves the direction when the projector is AIMED, at a fixed azimuth', () => {
    // Tilt is the other half of the derivation: same body, different throw.
    const flat = deriveScene(at({ tilt: 0 }));
    const aimed = deriveScene(at({ tilt: -4 }));
    const steep = deriveScene(at({ tilt: -20 }));
    expect(aimed.axisDeg).not.toBeCloseTo(flat.axisDeg, 3);
    expect(steep.axisDeg).not.toBeCloseTo(aimed.axisDeg, 3);
    // Aiming the nose up walks the throw further down-frame, toward the viewer.
    expect(Math.sin(steep.axisRad)).toBeGreaterThan(Math.sin(flat.axisRad));
  });

  it('keeps the mirror out of the depth sweep and inside the matrix', () => {
    // The brief: "The mirror cancels out of u and v — it lives entirely in the
    // matrix." Flipping it must change the face and nothing else.
    const left = at({ mirror: -1 });
    const right = at({ mirror: 1 });
    expect(depthStep(right)).toEqual(depthStep(left));
    expect(faceMatrix(right)[0]).toBeCloseTo(-faceMatrix(left)[0], 9);
    expect(faceMatrix(right)[3]).toBeCloseTo(faceMatrix(left)[3], 9);
  });
});

/* ------------------------------------------------------------------------- */

describe('streak scene — matrix helpers', () => {
  it('composes in nesting order: mul(m, n) applies n first', () => {
    const m = mul(translate(10, 0), translate(0, 5));
    expect(m[4]).toBeCloseTo(10, 9);
    expect(m[5]).toBeCloseTo(5, 9);
  });

  it('rotates about the given centre, not the origin', () => {
    const r = rotateAbout(90, 100, 100);
    // The centre is a fixed point.
    expect(r[0] * 100 + r[2] * 100 + r[4]).toBeCloseTo(100, 9);
    expect(r[1] * 100 + r[3] * 100 + r[5]).toBeCloseTo(100, 9);
  });

  it('matches the mock: translate ∘ rotate is a rotation about the moved centre', () => {
    // What lets every extruded rect carry ONE transform instead of two nested
    // groups: translate(o) ∘ rotate(τ, C) == rotate(τ, C + o) ∘ translate(o).
    const o = { x: -12.4, y: -2.1 };
    const a = mul(translate(o.x, o.y), rotateAbout(-4, 100, 100));
    const b = mul(rotateAbout(-4, 100 + o.x, 100 + o.y), translate(o.x, o.y));
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
  });
});

describe('streak scene — shading', () => {
  it('lifts dark bases toward white and drops light ones toward crimson', () => {
    // The body is mid-value, so it lifts; the lens face is near-white, so it
    // falls away instead of blowing out.
    expect(farShade('#e11d48')).toBe(mixHex('#e11d48', '#ffffff', 0.19));
    expect(farShade('#ffe4e6')).toBe(mixHex('#ffe4e6', '#4c0519', 0.26));
  });

  it('mixes endpoints exactly', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('streak scene — layout', () => {
  it('fits the width and centres vertically, never cropping', () => {
    const l = sceneLayout(390, 852);
    expect(l.scale).toBeCloseTo(1, 6);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBeCloseTo((852 - 660) / 2, 6);
  });

  it('lands the numeral near the optical centre of any handset we ship to', () => {
    // 4.7" through 6.7", portrait. The composition must not drift up or down
    // the screen as the device changes.
    for (const [w, h] of [
      [375, 667],
      [390, 844],
      [393, 852],
      [412, 915],
      [430, 932],
    ]) {
      const l = sceneLayout(w, h);
      const d = deriveScene();
      const p = toScreen(l, d.numeralX, d.numeralY);
      expect(p.y / h).toBeGreaterThan(0.42);
      expect(p.y / h).toBeLessThan(0.54);
      expect(p.x / w).toBeGreaterThan(0.3);
      expect(p.x / w).toBeLessThan(0.5);
    }
  });

  it('maps the scene corners onto the screen box', () => {
    const l = sceneLayout(390, 660);
    expect(toScreen(l, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(toScreen(l, SCENE_W, SCENE_H)).toEqual({ x: 390, y: 660 });
  });
});
