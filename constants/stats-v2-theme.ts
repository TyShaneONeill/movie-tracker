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
