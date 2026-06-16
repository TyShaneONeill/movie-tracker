import { Ionicons } from '@expo/vector-icons';

/**
 * The 12 genre chips shown on the OnboardingV2 Genres step.
 *
 * `slug` is the stable value persisted to `profiles.favorite_genres`.
 * `tmdbId` maps to a TMDB genre id for the personalized Watchlist step's
 * discover queries — note "Indie" has NO TMDB genre id (it's a
 * keyword/company concept, not a TMDB genre), so it is stored as a
 * preference but skipped when building discover requests.
 */
export interface OnboardingGenre {
  slug: string;
  label: string;
  tmdbId: number | null;
  icon: keyof typeof Ionicons.glyphMap;
}

export const ONBOARDING_GENRES: readonly OnboardingGenre[] = [
  { slug: 'sci-fi', label: 'Sci-Fi', tmdbId: 878, icon: 'planet' },
  { slug: 'drama', label: 'Drama', tmdbId: 18, icon: 'film' },
  { slug: 'horror', label: 'Horror', tmdbId: 27, icon: 'skull' },
  { slug: 'comedy', label: 'Comedy', tmdbId: 35, icon: 'happy' },
  { slug: 'action', label: 'Action', tmdbId: 28, icon: 'flame' },
  { slug: 'thriller', label: 'Thriller', tmdbId: 53, icon: 'eye' },
  { slug: 'romance', label: 'Romance', tmdbId: 10749, icon: 'heart' },
  { slug: 'animation', label: 'Animation', tmdbId: 16, icon: 'color-wand' },
  { slug: 'documentary', label: 'Documentary', tmdbId: 99, icon: 'videocam' },
  { slug: 'fantasy', label: 'Fantasy', tmdbId: 14, icon: 'sparkles' },
  { slug: 'crime', label: 'Crime', tmdbId: 80, icon: 'finger-print' },
  { slug: 'indie', label: 'Indie', tmdbId: null, icon: 'leaf' },
] as const;

export const MIN_GENRES = 3;

/** Map selected genre slugs -> TMDB genre ids (dropping any without one, e.g. Indie). */
export function genreSlugsToTmdbIds(slugs: string[]): number[] {
  return ONBOARDING_GENRES.filter(
    (g) => slugs.includes(g.slug) && g.tmdbId != null
  ).map((g) => g.tmdbId as number);
}

/** Human-readable labels for selected slugs (for the personalized subheads). */
export function genreSlugsToLabels(slugs: string[]): string[] {
  return ONBOARDING_GENRES.filter((g) => slugs.includes(g.slug)).map((g) => g.label);
}
