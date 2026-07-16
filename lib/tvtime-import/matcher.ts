import type { TMDBMovie } from '@/lib/tmdb.types';
import type {
  MatchOptions,
  MatchedShow,
  MovieMatchResult,
  ParsedMovie,
  ParsedShow,
  ParsedTvTimePayload,
  ShowMatchResult,
  TmdbGateway,
  TvTimeMatchResult,
} from './types';

const DEFAULT_CONCURRENCY = 5;

/** True when an error looks like an HTTP 429 (rate limited). */
function isRateLimit(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429');
}

/** Run `fn`; on a 429, wait briefly and retry exactly once. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isRateLimit(error)) throw error;
    await new Promise((r) => setTimeout(r, 500));
    return fn();
  }
}

/** Map over `items` with bounded concurrency, preserving input order. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function releaseYear(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function candidateYear(movie: TMDBMovie): number | null {
  return releaseYear(movie.release_date ?? null);
}

/**
 * Resolve TV Time shows to TMDB tv ids via `findTvByTvdbId`. Episodes need no
 * extra lookup — the app addresses episodes by season/episode number against
 * the matched show. A show whose TVDB id has no TMDB mapping (or whose lookup
 * errors after a retry) lands in `unmatched`.
 */
export async function matchShows(
  shows: ParsedShow[],
  gateway: TmdbGateway,
  options: MatchOptions = {}
): Promise<ShowMatchResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const result: ShowMatchResult = { matched: [], unmatched: [] };

  const resolved = await mapPool(shows, concurrency, async (show): Promise<MatchedShow | null> => {
    let hit;
    try {
      hit = await withRetry(() => gateway.findTvByTvdbId(show.tvdbId));
    } catch {
      return null;
    }
    if (!hit) return null;

    // Episode/season counts aren't in TMDB `/find`; fetch best-effort so the
    // show row matches an organically-tracked one. Never fails the match.
    let counts: { numberOfEpisodes: number | null; numberOfSeasons: number | null } | null = null;
    if (gateway.getShowEpisodeCounts) {
      try {
        counts = await gateway.getShowEpisodeCounts(hit.id);
      } catch {
        counts = null;
      }
    }

    return {
      ...show,
      tmdbId: hit.id,
      tmdbName: hit.name,
      posterPath: hit.posterPath ?? null,
      backdropPath: hit.backdropPath ?? null,
      genreIds: hit.genreIds ?? [],
      firstAirDate: hit.firstAirDate ?? null,
      voteAverage: hit.voteAverage ?? null,
      numberOfEpisodes: counts?.numberOfEpisodes ?? null,
      numberOfSeasons: counts?.numberOfSeasons ?? null,
    };
  });

  resolved.forEach((matched, i) => {
    if (matched) result.matched.push(matched);
    else result.unmatched.push(shows[i]);
  });

  return result;
}

/**
 * Resolve TV Time movies to TMDB via title search. An exact (case-insensitive)
 * title match whose release year equals the export's year is confident and goes
 * to `matched`; any other candidates go to `needsReview` for human
 * disambiguation; no candidates → `unmatched`.
 */
export async function matchMovies(
  movies: ParsedMovie[],
  gateway: TmdbGateway,
  options: MatchOptions = {}
): Promise<MovieMatchResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const result: MovieMatchResult = { matched: [], needsReview: [], unmatched: [] };

  const searched = await mapPool(movies, concurrency, async (movie) => {
    const year = releaseYear(movie.releaseDate);
    try {
      return await withRetry(() => gateway.searchMovie(movie.title, year));
    } catch {
      return [] as TMDBMovie[];
    }
  });

  searched.forEach((candidates, i) => {
    const movie = movies[i];
    if (candidates.length === 0) {
      result.unmatched.push(movie);
      return;
    }
    const year = releaseYear(movie.releaseDate);
    const wanted = movie.title.trim().toLowerCase();
    const confident =
      year !== null &&
      candidates.find(
        (c) => c.title?.trim().toLowerCase() === wanted && candidateYear(c) === year
      );
    if (confident) {
      result.matched.push({ ...movie, tmdbId: confident.id, tmdbMovie: confident });
    } else {
      result.needsReview.push({ ...movie, candidates });
    }
  });

  return result;
}

/** Match a parsed TV Time payload (shows + movies) to TMDB. */
export async function matchTvTimePayload(
  payload: ParsedTvTimePayload,
  gateway: TmdbGateway,
  options: MatchOptions = {}
): Promise<TvTimeMatchResult> {
  const [shows, movies] = await Promise.all([
    matchShows(payload.shows, gateway, options),
    matchMovies(payload.movies, gateway, options),
  ]);
  return { shows, movies, warnings: payload.warnings };
}
