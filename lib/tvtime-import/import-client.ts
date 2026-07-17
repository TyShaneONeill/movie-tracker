import { supabase } from '@/lib/supabase';
import type { TvTimeMatchResult } from './types';
import {
  addImportCounts,
  emptyImportCounts,
  MAX_EPISODES_PER_CALL,
  MAX_MOVIES_PER_CALL,
  MAX_SHOWS_PER_CALL,
  type ImportCounts,
  type ImportMovie,
  type ImportShow,
} from './import-types';

// ---------------------------------------------------------------------------
// Matcher output -> edge-fn contract
// ---------------------------------------------------------------------------

/**
 * Translate a matched TV Time payload into the `import-tvtime` request shape.
 * Only CONFIDENTLY matched shows/movies are imported here — `needsReview`
 * movies await user disambiguation (the "Needs a look" list), and `unmatched`
 * items are dropped (surfaced to the user as counts, never silently imported
 * against a wrong id).
 */
export function mapMatchToImportItems(match: TvTimeMatchResult): {
  shows: ImportShow[];
  movies: ImportMovie[];
} {
  const shows: ImportShow[] = match.shows.matched.map((s) => ({
    tmdbShowId: s.tmdbId,
    name: s.tmdbName || s.name,
    followed: s.followed,
    favorited: s.favorited,
    episodes: s.episodes.map((e) => ({
      season: e.season,
      episode: e.episode,
      watchedAt: e.watchedAt,
    })),
    posterPath: s.posterPath ?? null,
    backdropPath: s.backdropPath ?? null,
    genreIds: s.genreIds ?? [],
    firstAirDate: s.firstAirDate ?? null,
    voteAverage: s.voteAverage ?? null,
    numberOfEpisodes: s.numberOfEpisodes ?? null,
    numberOfSeasons: s.numberOfSeasons ?? null,
  }));

  const movies: ImportMovie[] = match.movies.matched.map((m) => ({
    tmdbId: m.tmdbId,
    title: m.title,
    status: m.status,
    watchedAt: m.watchedAt,
    rewatchCount: m.rewatchCount,
    // The search-movies result carried on the matched movie already has these.
    posterPath: m.tmdbMovie?.poster_path ?? null,
    backdropPath: m.tmdbMovie?.backdrop_path ?? null,
    genreIds: m.tmdbMovie?.genre_ids ?? [],
    voteAverage: m.tmdbMovie?.vote_average ?? null,
    releaseDate: m.tmdbMovie?.release_date ?? m.releaseDate ?? null,
  }));

  return { shows, movies };
}

// ---------------------------------------------------------------------------
// Chunking (respects the edge fn's per-call ceilings)
// ---------------------------------------------------------------------------

export interface ImportChunk {
  shows: ImportShow[];
  movies: ImportMovie[];
}

export interface ChunkCaps {
  maxEpisodes?: number;
  maxMovies?: number;
  maxShows?: number;
}

function episodeCount(shows: ImportShow[]): number {
  return shows.reduce((sum, s) => sum + s.episodes.length, 0);
}

/** Split any show whose episode list exceeds `maxEpisodes` into whole-metadata
 *  parts, each carrying a ≤`maxEpisodes` slice. A 0-episode show yields one
 *  empty part (it still needs one call to create the show / set favorited). */
function splitOversizedShows(shows: ImportShow[], maxEpisodes: number): ImportShow[] {
  const parts: ImportShow[] = [];
  for (const show of shows) {
    if (show.episodes.length <= maxEpisodes) {
      parts.push(show);
      continue;
    }
    for (let i = 0; i < show.episodes.length; i += maxEpisodes) {
      parts.push({ ...show, episodes: show.episodes.slice(i, i + maxEpisodes) });
    }
  }
  return parts;
}

/** Greedy-pack show parts into chunks bounded by BOTH total episodes and total
 *  show count per chunk. The show-count bound is what keeps a follows-heavy
 *  import (thousands of 0-episode shows, which add nothing to the episode total)
 *  from packing into one oversized chunk. */
function packShows(parts: ImportShow[], maxEpisodes: number, maxShows: number): ImportShow[][] {
  const chunks: ImportShow[][] = [];
  let current: ImportShow[] = [];
  let currentEpisodes = 0;
  for (const part of parts) {
    if (
      current.length > 0 &&
      (currentEpisodes + part.episodes.length > maxEpisodes || current.length >= maxShows)
    ) {
      chunks.push(current);
      current = [];
      currentEpisodes = 0;
    }
    current.push(part);
    currentEpisodes += part.episodes.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Slice shows + movies into chunks that each respect BOTH per-call ceilings
 * (episodes across all shows, and movie count). Show chunks and movie chunks
 * are zipped so a single call carries as much of both as its caps allow —
 * fewer round-trips for a large import. Returns [] when there's nothing to send.
 */
export function chunkImportItems(
  shows: ImportShow[],
  movies: ImportMovie[],
  caps: ChunkCaps = {}
): ImportChunk[] {
  const maxEpisodes = Math.max(1, caps.maxEpisodes ?? MAX_EPISODES_PER_CALL);
  const maxMovies = Math.max(1, caps.maxMovies ?? MAX_MOVIES_PER_CALL);
  const maxShows = Math.max(1, caps.maxShows ?? MAX_SHOWS_PER_CALL);

  const showChunks = packShows(splitOversizedShows(shows, maxEpisodes), maxEpisodes, maxShows);
  const movieChunks = chunkArray(movies, maxMovies);

  const chunkCount = Math.max(showChunks.length, movieChunks.length);
  const chunks: ImportChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunks.push({ shows: showChunks[i] ?? [], movies: movieChunks[i] ?? [] });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Thrown when the edge fn rejects a chunk as too large (413). The orchestrator
 *  catches this to re-slice with smaller caps rather than failing the import. */
export class ChunkTooLargeError extends Error {
  constructor() {
    super('chunk_too_large');
    this.name = 'ChunkTooLargeError';
  }
}

/** Pull an HTTP status + parsed error body off a supabase FunctionsHttpError,
 *  tolerating SDK-version differences (mirrors hooks/use-generate-art.ts). */
async function extractError(error: unknown): Promise<{ status?: number; body?: { error?: string } }> {
  const e = error as { status?: number; context?: { status?: number; json?: () => Promise<unknown>; body?: string }; data?: unknown };
  const status = e?.status ?? e?.context?.status;
  let body: { error?: string } | undefined;
  try {
    if (typeof e?.context?.json === 'function') body = (await e.context.json()) as { error?: string };
    else if (typeof e?.context?.body === 'string') body = JSON.parse(e.context.body);
    else if (e?.data) body = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as { error?: string };
  } catch {
    // best-effort; body stays undefined
  }
  return { status, body };
}

/** Send one chunk. Idempotent server-side (natural keys), so the orchestrator
 *  may safely retry a failed call with the same `importKey`. */
export async function sendImportChunk(
  chunk: ImportChunk,
  importKey: string,
  accessToken: string
): Promise<ImportCounts> {
  const { data, error } = await supabase.functions.invoke<ImportCounts>('import-tvtime', {
    body: { importKey, shows: chunk.shows, movies: chunk.movies },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    const { status, body } = await extractError(error);
    if (status === 413 || body?.error === 'chunk_too_large') throw new ChunkTooLargeError();
    throw new Error(body?.error || error.message || 'Import failed');
  }
  if (!data) throw new Error('Import returned no result');
  return data;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ImportProgress {
  /** Episodes + movies written so far (skipped/invalid count as processed). */
  processed: number;
  /** Total episodes + movies to attempt across the whole import. */
  total: number;
}

export interface RunImportArgs {
  shows: ImportShow[];
  movies: ImportMovie[];
  importKey: string;
  accessToken: string;
  onProgress?: (progress: ImportProgress) => void;
  /** Injectable for tests. Defaults to {@link sendImportChunk}. */
  send?: (chunk: ImportChunk, importKey: string, accessToken: string) => Promise<ImportCounts>;
  caps?: ChunkCaps;
  /**
   * Cheap cooperative abort checked between chunks. Returns false to stop the
   * run early (the caller flips it when the signed-in user changes — logout or
   * account switch — so a run never completes for a user who's no longer here).
   * Returning early yields whatever counts accrued so far; the caller discards them.
   */
  shouldContinue?: () => boolean;
}

function chunkUnitCount(chunk: ImportChunk): number {
  return episodeCount(chunk.shows) + chunk.movies.length;
}

/** Smallest caps we'll re-slice down to before giving up on a stubborn 413. */
const MIN_CAP = 1;

/**
 * Run the full chunked import: send each chunk sequentially, aggregate counts,
 * report progress, retry a transiently-failed chunk once (idempotent), and on a
 * 413 re-slice that chunk with halved caps until it fits. Progress is reported
 * as processed / total episodes+movies so the UI can drive a bar and be
 * backgrounded without losing its place.
 */
export async function runTvTimeImport(args: RunImportArgs): Promise<ImportCounts> {
  const send = args.send ?? sendImportChunk;
  const caps: ChunkCaps = {
    maxEpisodes: args.caps?.maxEpisodes ?? MAX_EPISODES_PER_CALL,
    maxMovies: args.caps?.maxMovies ?? MAX_MOVIES_PER_CALL,
    maxShows: args.caps?.maxShows ?? MAX_SHOWS_PER_CALL,
  };

  const total = episodeCount(args.shows) + args.movies.length;
  let processed = 0;
  let counts = emptyImportCounts();
  const report = () => args.onProgress?.({ processed, total });
  report();

  const chunks = chunkImportItems(args.shows, args.movies, caps);

  const sendWithReslice = async (chunk: ImportChunk, chunkCaps: ChunkCaps): Promise<void> => {
    try {
      const result = await sendOnceWithRetry(chunk, args.importKey, args.accessToken, send);
      counts = addImportCounts(counts, result);
      processed += chunkUnitCount(chunk);
      report();
    } catch (error) {
      if (!(error instanceof ChunkTooLargeError)) throw error;
      const nextEpisodes = Math.floor((chunkCaps.maxEpisodes ?? MAX_EPISODES_PER_CALL) / 2);
      const nextMovies = Math.floor((chunkCaps.maxMovies ?? MAX_MOVIES_PER_CALL) / 2);
      const nextShows = Math.floor((chunkCaps.maxShows ?? MAX_SHOWS_PER_CALL) / 2);
      if (nextEpisodes < MIN_CAP && nextMovies < MIN_CAP && nextShows < MIN_CAP) throw error;
      const smallerCaps: ChunkCaps = {
        maxEpisodes: Math.max(MIN_CAP, nextEpisodes),
        maxMovies: Math.max(MIN_CAP, nextMovies),
        maxShows: Math.max(MIN_CAP, nextShows),
      };
      const subChunks = chunkImportItems(chunk.shows, chunk.movies, smallerCaps);
      // Guard against a no-op re-slice (single item still 413ing) looping forever.
      if (subChunks.length <= 1 && chunkUnitCount(subChunks[0] ?? { shows: [], movies: [] }) === chunkUnitCount(chunk)) {
        throw error;
      }
      for (const sub of subChunks) await sendWithReslice(sub, smallerCaps);
    }
  };

  for (const chunk of chunks) {
    // Cooperative abort point — bail between chunks if the caller has revoked
    // the run (user changed). Partial counts are returned but discarded upstream.
    if (args.shouldContinue && !args.shouldContinue()) return counts;
    await sendWithReslice(chunk, caps);
  }
  return counts;
}

/** Send a chunk, retrying exactly once on a non-413 error (the fn is idempotent). */
async function sendOnceWithRetry(
  chunk: ImportChunk,
  importKey: string,
  accessToken: string,
  send: (chunk: ImportChunk, importKey: string, accessToken: string) => Promise<ImportCounts>
): Promise<ImportCounts> {
  try {
    return await send(chunk, importKey, accessToken);
  } catch (error) {
    if (error instanceof ChunkTooLargeError) throw error;
    return send(chunk, importKey, accessToken);
  }
}
