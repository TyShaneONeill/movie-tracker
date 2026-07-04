/**
 * Stats v2 — theme-aware tokens (light + dark).
 *
 * The dark palette is the design-handoff prototype look (stats redesign,
 * vault PS-05); the light palette is a zinc-scale inversion aligned to
 * `constants/theme.ts` `Colors.light`, following the same approach as
 * `constants/scan-v2-theme.ts`.
 *
 * Components read the active palette via `useStatsColors()` (resolves
 * light/dark/system through `useEffectiveColorScheme`).
 */

import { useEffectiveColorScheme } from '@/lib/theme-context';

export type StatsV2ColorTokens = {
  bg: string;
  card: string;
  cardHi: string;
  line: string;
  lineHi: string;
  text: string;
  sec: string;
  ter: string;
  faint: string;
  /** Premium/gold accent — darkened on light backgrounds for contrast. */
  gold: string;
  goldSoft: string;
  goldLine: string;
  /** Skeleton shimmer block color. */
  shimmer: string;
  /** Screen accent (rose) — Your Year current-month bar, highlights. */
  accent: {
    primary: string;
    deep: string;
    glow: string;
  };
  /** Your Year graph bar colors. */
  bar: {
    /** Past-month grey gradient, top → bottom. */
    pastTop: string;
    pastBottom: string;
    /** Future-month dashed empty stub. */
    futureBorder: string;
    futureBg: string;
    /** Future-month letter — fainter than `faint`. */
    futureLabel: string;
  };
  /** Stable genre segment colors, assigned by index (Top Genres split bar). */
  genrePalette: string[];
  /** Muted color for the aggregated "Other" genre bucket (6th slot). */
  genreOther: string;
  /** Per-stat accent colors (match the design handoff). */
  stat: {
    movies: string;
    tvShows: string;
    episodes: string;
    watchTime: string;
    firstTakes: string;
    avgRating: string;
  };
};

/** Dark palette — original prototype look. */
export const StatsV2ColorsDark: StatsV2ColorTokens = {
  bg: '#09090b',
  card: '#161619',
  cardHi: '#1d1d21',
  line: 'rgba(255,255,255,0.07)',
  lineHi: 'rgba(255,255,255,0.13)',
  text: '#fafafa',
  sec: '#a1a1aa',
  ter: '#71717a',
  faint: '#52525b',
  gold: '#fbbf24',
  goldSoft: 'rgba(251,191,36,0.12)',
  goldLine: 'rgba(251,191,36,0.35)',
  shimmer: 'rgba(255,255,255,0.06)',
  accent: {
    primary: '#e11d48',
    deep: '#9f1239',
    glow: 'rgba(225,29,72,0.45)',
  },
  bar: {
    pastTop: '#3f3f46',
    pastBottom: '#27272a',
    futureBorder: 'rgba(255,255,255,0.12)',
    futureBg: 'rgba(255,255,255,0.02)',
    futureLabel: 'rgba(255,255,255,0.18)',
  },
  genrePalette: [
    '#e11d48', // rose
    '#10b981', // emerald
    '#fbbf24', // amber
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
  ],
  genreOther: '#52525b', // zinc-600 — muted "everything else" on dark
  stat: {
    movies: '#e11d48',
    tvShows: '#10b981',
    episodes: '#8b5cf6',
    watchTime: '#3b82f6',
    firstTakes: '#fbbf24',
    avgRating: '#14b8a6',
  },
};

/** Light palette — zinc-scale inversion aligned to `Colors.light`. */
export const StatsV2ColorsLight: StatsV2ColorTokens = {
  bg: '#f4f4f5',
  card: '#ffffff',
  cardHi: '#f4f4f5',
  line: 'rgba(0,0,0,0.08)',
  lineHi: 'rgba(0,0,0,0.14)',
  text: '#18181b',
  sec: '#52525b',
  ter: '#71717a',
  faint: '#a1a1aa',
  gold: '#d97706', // amber-600: amber-400 (#fbbf24) is low-contrast on a light bg
  goldSoft: 'rgba(217,119,6,0.10)',
  goldLine: 'rgba(217,119,6,0.35)',
  shimmer: 'rgba(0,0,0,0.06)',
  accent: {
    primary: '#e11d48',
    deep: '#9f1239',
    glow: 'rgba(225,29,72,0.35)',
  },
  bar: {
    pastTop: '#d4d4d8', // zinc-300 → zinc-200: grey gradient inverted for light
    pastBottom: '#e4e4e7',
    futureBorder: 'rgba(0,0,0,0.14)',
    futureBg: 'rgba(0,0,0,0.02)',
    futureLabel: 'rgba(0,0,0,0.22)',
  },
  genrePalette: [
    '#e11d48', // rose
    '#059669', // emerald-600: emerald-500 is low-contrast on a light bg
    '#d97706', // amber-600 (see gold note above)
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#0d9488', // teal-600: teal-500 is low-contrast on a light bg
    '#f97316', // orange
  ],
  genreOther: '#a1a1aa', // zinc-400 — muted "everything else" on light
  stat: {
    movies: '#e11d48',
    tvShows: '#059669', // emerald-600: emerald-500 is low-contrast on a light bg
    episodes: '#8b5cf6',
    watchTime: '#3b82f6',
    firstTakes: '#d97706', // amber-600 on light (see gold note above)
    avgRating: '#0d9488', // teal-600: teal-500 is low-contrast on a light bg
  },
};

/**
 * Active stats-v2 palette for the user's effective theme. Use in every v2
 * component:
 *   const c = useStatsColors();  // then c.bg, c.card, c.stat.movies, …
 */
export function useStatsColors(): StatsV2ColorTokens {
  return useEffectiveColorScheme() === 'light' ? StatsV2ColorsLight : StatsV2ColorsDark;
}
