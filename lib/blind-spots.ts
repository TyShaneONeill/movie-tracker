/**
 * Pure view-model logic for the Blind Spots deep-dive (vault PS-22).
 *
 * Dependency-free (no RN / supabase imports, aside from the movie genre name
 * lookup) so the math is unit-testable in isolation — the hook
 * (`hooks/use-blind-spots.ts`) does the fetching and hands the user's watched
 * movies + the baked canon here for the actual computation.
 *
 * "Canon" is a curated list of 168 well-known films (24 per era) in
 * `lib/blind-spots-canon.json` — era coverage, the spotlight surprise, and
 * the "Start here" picks are all derived from the user's overlap (or lack
 * thereof) with that list. There is no community/similarity backend in v1
 * (only a handful of titles have 2+ raters); the copy stays honest about
 * what's actually known (the user's own library + TMDB's score).
 */

import { TMDB_GENRE_MAP } from './tmdb.types';
import rawCanon from './blind-spots-canon.json';

export type Era = 'pre70s' | '70s' | '80s' | '90s' | '00s' | '10s' | '20s';

/** One of the user's own logged movies (from `user_movies`, status = 'watched'). */
export interface UserMovie {
  tmdbId: number;
  genreIds: number[] | null;
}

/** One curated canon title (see `lib/blind-spots-canon.json`). */
export interface CanonFilm {
  era: Era;
  tmdbId: number;
  title: string;
  year: number;
  genreIds: number[];
  voteAverage: number;
  posterPath: string | null;
}

export interface EraCoverage {
  era: Era;
  label: string;
  pct: number;
  isGap: boolean;
}

export interface GenreGap {
  genreId: number;
  name: string;
  watched: number;
}

export interface Spotlight {
  tmdbId: number;
  title: string;
  year: number;
  posterPath: string | null;
  stat: string;
  statLabel: string;
  reason: string;
}

export interface Pick {
  tmdbId: number;
  title: string;
  year: number;
  posterPath: string | null;
  gapTag: string;
  social: string;
  reason: string;
}

export interface BlindSpots {
  eras: EraCoverage[];
  genreGaps: GenreGap[];
  spotlight: Spotlight | null;
  picks: Pick[];
  /** Number of the user's own watched movies fed in — lets the screen gate
   *  on the same INSIGHTS_THRESHOLD as the other "Going deeper" screens. */
  watchedCount: number;
}

/** Chronological era order — canon covers exactly these 7 eras. */
export const ERA_ORDER: Era[] = ['pre70s', '70s', '80s', '90s', '00s', '10s', '20s'];

/** Fixed denominator for era coverage % — 24 curated titles per era,
 *  independent of how many happen to be present in a given canon slice. */
export const CANON_FILMS_PER_ERA = 24;

/** Era coverage below this percent is flagged as a "gap" (rose, matches the
 *  design mockup). */
export const ERA_GAP_THRESHOLD_PCT = 20;

/** "Genres you skip" rows shown. */
export const GENRE_GAP_COUNT = 4;

const ERA_LABEL: Record<Era, string> = {
  pre70s: '–70s',
  '70s': '70s',
  '80s': '80s',
  '90s': '90s',
  '00s': '00s',
  '10s': '10s',
  '20s': '20s',
};

/** Full-sentence era name, used in the honest reason copy. */
const ERA_FULL: Record<Era, string> = {
  pre70s: 'movies before 1970',
  '70s': 'the 1970s',
  '80s': 'the 1980s',
  '90s': 'the 1990s',
  '00s': 'the 2000s',
  '10s': 'the 2010s',
  '20s': 'the 2020s',
};

/** Short "{era} gap" tag shown on pick rows, matching the mockup's style. */
const ERA_GAP_TAG: Record<Era, string> = {
  pre70s: 'Pre-1970s',
  '70s': '1970s',
  '80s': '1980s',
  '90s': '1990s',
  '00s': '2000s',
  '10s': '2010s',
  '20s': '2020s',
};

/** The baked canon, typed. Import this (not the raw JSON) from the hook. */
export const CANON_FILMS: CanonFilm[] = rawCanon as CanonFilm[];

function groupByEra(canon: CanonFilm[]): Map<Era, CanonFilm[]> {
  const map = new Map<Era, CanonFilm[]>();
  for (const era of ERA_ORDER) map.set(era, []);
  for (const film of canon) {
    const list = map.get(film.era);
    if (list) list.push(film);
    else map.set(film.era, [film]);
  }
  return map;
}

function computeEraCoverage(watchedIds: Set<number>, canonByEra: Map<Era, CanonFilm[]>): EraCoverage[] {
  return ERA_ORDER.map((era) => {
    const films = canonByEra.get(era) ?? [];
    const watchedInEra = films.filter((f) => watchedIds.has(f.tmdbId)).length;
    const pct = Math.round((watchedInEra / CANON_FILMS_PER_ERA) * 100);
    return { era, label: ERA_LABEL[era], pct, isGap: pct < ERA_GAP_THRESHOLD_PCT };
  });
}

/** Count the user's watched movies per movie genre — every movie genre is
 *  represented (defaulting to 0) so genres never logged surface as gaps
 *  rather than being absent from the map. Rows with null `genreIds` are
 *  skipped (nothing to count). */
function computeGenreCounts(userMovies: UserMovie[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of Object.keys(TMDB_GENRE_MAP)) counts.set(Number(id), 0);

  for (const movie of userMovies) {
    if (!movie.genreIds) continue;
    for (const id of movie.genreIds) {
      if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Highest-`voteAverage` film the user hasn't watched and hasn't already
 *  been picked elsewhere on this screen (spotlight/picks never repeat). */
function bestUnwatched(films: CanonFilm[], watchedIds: Set<number>, excludeIds: Set<number>): CanonFilm | undefined {
  return [...films]
    .filter((f) => !watchedIds.has(f.tmdbId) && !excludeIds.has(f.tmdbId))
    .sort((a, b) => b.voteAverage - a.voteAverage)[0];
}

/** Walk eras from weakest coverage upward until an unwatched film turns up —
 *  handles the edge case where the single weakest era is already fully
 *  watched. */
function findSpotlight(
  canonByEra: Map<Era, CanonFilm[]>,
  watchedIds: Set<number>,
  sortedByPct: EraCoverage[]
): { film: CanonFilm; era: Era } | undefined {
  for (const ec of sortedByPct) {
    const best = bestUnwatched(canonByEra.get(ec.era) ?? [], watchedIds, new Set());
    if (best) return { film: best, era: ec.era };
  }
  return undefined;
}

/**
 * Compute the full Blind Spots view model from the user's watched movies and
 * the curated canon. Pure — no side effects, no I/O.
 */
export function computeBlindSpots(userMovies: UserMovie[], canon: CanonFilm[]): BlindSpots {
  const watchedIds = new Set(userMovies.map((m) => m.tmdbId));
  const canonByEra = groupByEra(canon);

  const eras = computeEraCoverage(watchedIds, canonByEra);
  const sortedByPct = [...eras].sort((a, b) => a.pct - b.pct);
  const weakestEra = sortedByPct[0];
  const secondWeakestEra = sortedByPct[1];

  const genreCounts = computeGenreCounts(userMovies);
  const genresByCount = [...genreCounts.entries()].map(([genreId, watched]) => ({
    genreId,
    name: TMDB_GENRE_MAP[genreId],
    watched,
  }));
  const genreGaps = [...genresByCount].sort((a, b) => a.watched - b.watched).slice(0, GENRE_GAP_COUNT);
  const mostWatchedGenre =
    [...genresByCount].sort((a, b) => b.watched - a.watched).find((g) => g.watched > 0) ?? null;

  const spotlightMatch = findSpotlight(canonByEra, watchedIds, sortedByPct);
  const pickedIds = new Set<number>();
  let spotlight: Spotlight | null = null;
  if (spotlightMatch) {
    const { film, era } = spotlightMatch;
    pickedIds.add(film.tmdbId);
    spotlight = {
      tmdbId: film.tmdbId,
      title: film.title,
      year: film.year,
      posterPath: film.posterPath,
      stat: film.voteAverage.toFixed(1),
      statLabel: "on TMDB — and you haven't logged it",
      reason: mostWatchedGenre
        ? `You watch a lot of ${mostWatchedGenre.name} — but you've barely touched ${ERA_FULL[era]}. This is one of the best-reviewed films from it you haven't logged.`
        : `You've barely touched ${ERA_FULL[era]} — this is one of the best-reviewed films from it you haven't logged.`,
    };
  }

  const picks: Pick[] = [];

  if (weakestEra) {
    const p1 = bestUnwatched(canonByEra.get(weakestEra.era) ?? [], watchedIds, pickedIds);
    if (p1) {
      pickedIds.add(p1.tmdbId);
      picks.push({
        tmdbId: p1.tmdbId,
        title: p1.title,
        year: p1.year,
        posterPath: p1.posterPath,
        gapTag: `${ERA_GAP_TAG[weakestEra.era]} gap`,
        social: `TMDB ${p1.voteAverage.toFixed(1)}`,
        reason: mostWatchedGenre
          ? `You already gravitate toward ${mostWatchedGenre.name} — a well-reviewed way into ${ERA_FULL[weakestEra.era]}.`
          : `A well-reviewed way into ${ERA_FULL[weakestEra.era]}.`,
      });
    }
  }

  if (secondWeakestEra) {
    const p2 = bestUnwatched(canonByEra.get(secondWeakestEra.era) ?? [], watchedIds, pickedIds);
    if (p2) {
      pickedIds.add(p2.tmdbId);
      picks.push({
        tmdbId: p2.tmdbId,
        title: p2.title,
        year: p2.year,
        posterPath: p2.posterPath,
        gapTag: `${ERA_GAP_TAG[secondWeakestEra.era]} gap`,
        social: `TMDB ${p2.voteAverage.toFixed(1)}`,
        reason: mostWatchedGenre
          ? `You already gravitate toward ${mostWatchedGenre.name} — a well-reviewed way into ${ERA_FULL[secondWeakestEra.era]}.`
          : `A well-reviewed way into ${ERA_FULL[secondWeakestEra.era]}.`,
      });
    }
  }

  const topGenreGap = genreGaps[0];
  if (topGenreGap) {
    const genreCandidates = canon.filter((f) => f.genreIds.includes(topGenreGap.genreId));
    const p3 = bestUnwatched(genreCandidates, watchedIds, pickedIds);
    if (p3) {
      pickedIds.add(p3.tmdbId);
      picks.push({
        tmdbId: p3.tmdbId,
        title: p3.title,
        year: p3.year,
        posterPath: p3.posterPath,
        gapTag: `${topGenreGap.name} gap`,
        social: `TMDB ${p3.voteAverage.toFixed(1)}`,
        reason: mostWatchedGenre
          ? `You rarely watch ${topGenreGap.name} — but it's an easy next step if you already love ${mostWatchedGenre.name}.`
          : `You rarely watch ${topGenreGap.name} — a well-reviewed way to try it.`,
      });
    }
  }

  return { eras, genreGaps, spotlight, picks, watchedCount: userMovies.length };
}
