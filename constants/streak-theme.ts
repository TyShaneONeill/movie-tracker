/**
 * Colour tokens for the PS-15 streak screen, transcribed from the acceptance
 * mock (docs/design/ps15-streak/acceptance-mock.html) and the camera handoff
 * README. Dark values are the handoff's literal hexes; light values are the
 * founder's round-10 pass, sampled off his own screenshot.
 *
 * Kept out of constants/theme.ts on purpose: these are one screen's chrome, not
 * app-wide semantics, and the same split stats-v2 uses (constants/stats-v2-theme).
 */

import { useTheme } from '@/lib/theme-context';
import type { StreakHeroState } from '@/lib/streak-view';

export type StreakColorTokens = {
  bg: string;
  text: string;
  /** Body copy / lit sub-label. */
  sec: string;
  /** Close glyph, chevrons, mono chip labels. */
  ter: string;
  /** Idle sub-label, inactive mono. */
  muted: string;
  /** Footnote. */
  faint: string;
  /** Every chrome hairline. */
  line: string;
  /** Message card fill. */
  card: string;
  /** Stat chip fill. */
  chip: string;
  tabTrough: string;
  tabActive: string;
  tabIdle: string;
  soonLine: string;
  tint: string;
  gold: string;
  /** Calendar run pill fill + ink. */
  runBg: string;
  runInk: string;
  offInk: string;
};

const DARK: StreakColorTokens = {
  bg: '#09090b',
  text: '#fafafa',
  sec: '#a1a1aa',
  ter: '#71717a',
  muted: '#52525b',
  faint: '#3f3f46',
  line: '#1f1f24',
  card: '#131316',
  chip: '#0f0f12',
  tabTrough: '#101013',
  tabActive: '#232329',
  tabIdle: '#4a4a52',
  soonLine: '#2c2c33',
  tint: '#e11d48',
  gold: '#fbbf24',
  runBg: 'rgba(225,29,72,0.13)',
  runInk: '#fecdd3',
  offInk: '#3f3f46',
};

const LIGHT: StreakColorTokens = {
  bg: '#f4f4f5',
  text: '#18181b',
  sec: '#52525b',
  ter: '#a1a1aa',
  muted: '#a1a1aa',
  faint: '#c0c0c6',
  line: 'rgba(0,0,0,0.10)',
  card: '#ffffff',
  chip: '#fafafa',
  tabTrough: '#ffffff',
  tabActive: '#e4e4e7',
  tabIdle: '#a1a1aa',
  soonLine: 'rgba(0,0,0,0.15)',
  tint: '#e11d48',
  gold: '#fbbf24',
  runBg: 'rgba(225,29,72,0.15)',
  runInk: '#9f1239',
  offInk: '#a1a1aa',
};

export function useStreakColors(): { c: StreakColorTokens; isDark: boolean } {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme !== 'light';
  return { c: isDark ? DARK : LIGHT, isDark };
}

/** The camera's thirteen parts, one fill per role. Handoff state-palette table. */
export type CameraPalette = {
  body: string;
  bodySh: string;
  reelA: string;
  reelB: string;
  reelIn: string;
  holes: string;
  lens: string;
  face: string;
  dotc: string;
  mount: string;
  ring: string;
  spark: string;
  glowHalo: string;
  /**
   * Beam cone gradient. Colour and alpha are separate because react-native-svg
   * drops the alpha channel of an `rgba()` `stopColor` — passing the handoff's
   * rgba strings straight through paints the cone fully opaque, which is a hard
   * bright wedge instead of a projector beam.
   */
  beam: string;
  /** Alpha at the lens, at the mid stop, and the offset where the cone dies. */
  beamAlphaA: number;
  beamAlphaB: number;
  beamFalloff: number;
  /** Whole-camera glow colour, or null for none (idle). */
  camGlow: string | null;
};

const CAMERA_DARK: Record<StreakHeroState, CameraPalette> = {
  idle: {
    body: '#2c2c33', bodySh: '#242429', reelA: '#3f3f46', reelB: '#37373e', reelIn: '#1b1b1f',
    holes: '#52525b', lens: '#37373e', face: '#4a4a52', dotc: '#4a4a52', mount: '#52525b',
    ring: '#3f3f46', spark: '#3f3f46', glowHalo: '#ffffff',
    beam: '#000000', beamAlphaA: 0, beamAlphaB: 0, beamFalloff: 0.92, camGlow: null,
  },
  active: {
    body: '#e11d48', bodySh: '#be123c', reelA: '#f43f5e', reelB: '#be123c', reelIn: '#1c1017',
    holes: '#fda4af', lens: '#9f1239', face: '#ffe4e6', dotc: '#fecdd3', mount: '#d4d4d8',
    ring: '#f43f5e', spark: '#fda4af', glowHalo: '#ffdcc2',
    beam: '#ffdec4', beamAlphaA: 0.55, beamAlphaB: 0.14, beamFalloff: 0.92,
    camGlow: 'rgba(225,29,72,0.35)',
  },
  milestone: {
    body: '#f59e0b', bodySh: '#d97706', reelA: '#fbbf24', reelB: '#d97706', reelIn: '#241703',
    holes: '#fde68a', lens: '#b45309', face: '#fef3c7', dotc: '#fde68a', mount: '#fde68a',
    ring: '#fbbf24', spark: '#fde68a', glowHalo: '#ffe58f',
    beam: '#ffe08a', beamAlphaA: 0.6, beamAlphaB: 0.16, beamFalloff: 0.92,
    camGlow: 'rgba(251,191,36,0.35)',
  },
};

/**
 * Light mode changes exactly two things: the unlit camera is read off the light
 * half of the zinc ramp instead of the handoff's charcoal silhouette (a dark
 * blot on white), and the beam is repainted at a higher saturation with a
 * linear falloff — on white the handoff cone was too weak, not too pale. The
 * lit and milestone camera palettes are the handoff's, untouched.
 */
const CAMERA_LIGHT: Record<StreakHeroState, CameraPalette> = {
  idle: {
    body: '#d4d4d8', bodySh: '#c2c2c9', reelA: '#b9b9c0', reelB: '#c9c9ce', reelIn: '#ececee',
    holes: '#97979f', lens: '#b0b0b8', face: '#9a9aa2', dotc: '#b0b0b8', mount: '#a7a7af',
    ring: '#c9c9ce', spark: '#c9c9ce', glowHalo: '#ffffff',
    beam: '#000000', beamAlphaA: 0, beamAlphaB: 0, beamFalloff: 0.92, camGlow: null,
  },
  active: {
    ...CAMERA_DARK.active,
    beam: '#faa24d', beamAlphaA: 0.6, beamAlphaB: 0, beamFalloff: 0.92,
  },
  milestone: {
    ...CAMERA_DARK.milestone,
    beam: '#fab414', beamAlphaA: 0.7, beamAlphaB: 0, beamFalloff: 1,
  },
};

export function cameraPalette(state: StreakHeroState, isDark: boolean): CameraPalette {
  return (isDark ? CAMERA_DARK : CAMERA_LIGHT)[state];
}
