/**
 * Ticket Scan v2 — theme-aware tokens (light + dark).
 *
 * v2 now follows the account theme. Components read the active palette via
 * `useScanColors()` (resolves light/dark/system through `useEffectiveColorScheme`).
 * The dark palette is the original prototype look; the light palette is a
 * zinc-scale inversion aligned to `constants/theme.ts` `Colors.light`.
 *
 * The live-camera surface (`screen-camera.tsx`) stays permanently dark by design
 * (white chrome over a dark camera feed) — it imports `ScanV2ColorsDark` directly.
 *
 * `ScanV2Accent` (rose) is theme-invariant: it reads correctly on both light and
 * dark, matching how `theme.ts` keeps the rose accent identical across schemes.
 */

import { useEffectiveColorScheme } from '@/lib/theme-context';

export type ScanV2ColorTokens = {
  bg: string;
  bgAlt: string;
  surface: string;
  card: string;
  cardHi: string;
  line: string;
  lineHi: string;
  text: string;
  sec: string;
  ter: string;
  field: string;
  fieldLine: string;
  emerald: string;
  amber: string;
};

/** Dark palette — original v2 look + the permanently-dark camera surface. */
export const ScanV2ColorsDark: ScanV2ColorTokens = {
  bg: '#09090b',
  bgAlt: '#0a0a0d',
  surface: '#141418',
  card: '#1b1b20',
  cardHi: '#26262d',
  line: 'rgba(255,255,255,0.08)',
  lineHi: 'rgba(255,255,255,0.16)',
  text: '#fafafa',
  sec: '#a1a1aa',
  ter: '#71717a',
  field: 'rgba(255,255,255,0.05)',
  fieldLine: 'rgba(255,255,255,0.09)',
  emerald: '#10b981',
  amber: '#fbbf24',
};

/** Light palette — zinc-scale inversion aligned to `Colors.light`. */
export const ScanV2ColorsLight: ScanV2ColorTokens = {
  bg: '#f4f4f5',
  bgAlt: '#fafafa',
  surface: '#ffffff',
  card: '#ffffff',
  cardHi: '#f4f4f5',
  line: 'rgba(0,0,0,0.08)',
  lineHi: 'rgba(0,0,0,0.14)',
  text: '#18181b',
  sec: '#52525b',
  ter: '#a1a1aa',
  field: 'rgba(0,0,0,0.04)',
  fieldLine: 'rgba(0,0,0,0.10)',
  emerald: '#10b981',
  amber: '#d97706', // amber-600: amber-400 (#fbbf24) is low-contrast on a light bg
};

/**
 * Active scan-v2 palette for the user's effective theme. Use in every v2 component:
 *   const c = useScanColors();  // then c.bg, c.text, c.card, …
 * (The camera surface uses `ScanV2ColorsDark` directly — it stays dark.)
 */
export function useScanColors(): ScanV2ColorTokens {
  return useEffectiveColorScheme() === 'light' ? ScanV2ColorsLight : ScanV2ColorsDark;
}

/** Rose accent — theme-invariant (valid on light + dark). */
export const ScanV2Accent = {
  primary: '#e11d48',
  deep: '#be123c',
  soft: 'rgba(225,29,72,0.14)',
  glow: 'rgba(225,29,72,0.40)',
  on: '#ffffff',
} as const;

export type ScanV2AccentTokens = typeof ScanV2Accent;
