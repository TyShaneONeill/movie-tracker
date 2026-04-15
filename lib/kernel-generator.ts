import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

// LCG pseudo-random — deterministic from seed
function makeLCG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

export function buildKernelPath(seed: number, sizePx: number): SkPath {
  const rng = makeLCG(seed);
  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const baseR = sizePx * 0.38;
  const pointCount = 7;

  const angles = Array.from({ length: pointCount }, (_, i) => (i / pointCount) * Math.PI * 2);
  const radii = angles.map(() => baseR * (0.75 + rng() * 0.5));

  const path = Skia.Path.Make();
  path.moveTo(
    cx + radii[0] * Math.cos(angles[0]),
    cy + radii[0] * Math.sin(angles[0])
  );
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount;
    const cpDist = baseR * 0.45;
    const cp1x = cx + (radii[i] + cpDist) * Math.cos(angles[i] + 0.3);
    const cp1y = cy + (radii[i] + cpDist) * Math.sin(angles[i] + 0.3);
    const cp2x = cx + (radii[next] + cpDist) * Math.cos(angles[next] - 0.3);
    const cp2y = cy + (radii[next] + cpDist) * Math.sin(angles[next] - 0.3);
    path.cubicTo(
      cp1x, cp1y, cp2x, cp2y,
      cx + radii[next] * Math.cos(angles[next]),
      cy + radii[next] * Math.sin(angles[next])
    );
  }
  path.close();
  return path;
}

// Size in dp: 28–42 range, seeded
export function kernelSize(seed: number): number {
  const rng = makeLCG(seed ^ 0xDEADBEEF);
  return 28 + Math.floor(rng() * 15);
}

// How much butter on this kernel: 0.1–0.65 (seeded)
export function kernelButterOpacity(seed: number): number {
  const rng = makeLCG(seed ^ 0xBEEF1234);
  return 0.1 + rng() * 0.55;
}

// Butter hex string with alpha baked in (Paint fill needs string colors in Skia v2.2.12)
export function kernelButterHex(seed: number): string {
  const rng = makeLCG(seed ^ 0xBEEF1234);
  const opacity = 0.1 + rng() * 0.55;
  const alpha = Math.round(opacity * 255);
  return `#F5C842${alpha.toString(16).padStart(2, '0')}`;
}

// Subtle base opacity variation: 0.88–1.0 (seeded)
export function kernelBaseOpacity(seed: number): number {
  const rng = makeLCG(seed ^ 0xCAFE5678);
  return 0.88 + rng() * 0.12;
}
