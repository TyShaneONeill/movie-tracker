import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// import-tvtime — bulk-write path for the "Import from TV Time" feature (PR 2).
//
// Server-side only. Writes a user's parsed+matched TV Time history into
// user_tv_shows / user_episode_watches / user_movies, tagged
// source='tvtime_import' so the weekly-recap RPC excludes it (imported rows
// carry now()-defaulted added_at/created_at and would otherwise fake "this
// week" activity). The client calls this repeatedly with slices of the
// payload for a progress UI, so every call is independently idempotent via
// natural keys (select-then-insert) — a re-sent chunk inserts nothing.
//
// Robustness invariants (a stuck row would strand the user's whole import,
// because the client retries the same chunk):
//   * Every field is validated at the boundary. A malformed row NEVER 500s
//     the chunk — it is counted as `invalid` and skipped so the rest imports.
//   * Batch inserts fall back to per-row inserts on an unexpected DB error,
//     isolating the one bad row from its neighbours.
//   * Concurrent/retried calls are race-safe: episodes via the partial unique
//     index on watch_number=1, movies via the partial unique index scoped to
//     source='tvtime_import' — both paired with a 23505 recheck backstop.
//
// Semantics that are intentionally narrow in v1 (documented, not bugs):
//   * `followed` is informational. ALL imported shows land as status='watching'
//     (including episode-only shows) unless the user already tracks the show,
//     in which case their existing status is preserved.
//   * `favorited=true` sets is_liked on new shows and UPGRADES is_liked on an
//     existing show row (never downgrades true->false).
//   * `rewatchCount` is NOT modeled — user_movies has no rewatch-count column;
//     rewatches are separate journey rows. An imported movie lands as a single
//     watch in v1.
//
// Deliberately does NOT call record_user_activity (would stamp today's streak),
// check-achievements, or insert reviews/first_takes (would fan out follower
// notifications). Episode/movie writes emit no notifications or feed events.
//
// PII hygiene: log counts, importKey, and error codes only — never titles or
// row content (per PR #681 review).
// ============================================================================

// --- Payload contract (matcher output from PR 1) ---------------------------
interface ImportEpisode {
  season: number;
  episode: number;
  watchedAt: string | null;
}

interface ImportShow {
  tmdbShowId: number;
  name: string;
  followed: boolean;
  favorited: boolean;
  episodes: ImportEpisode[];
  // Optional metadata (backward compat) — persisted so imported shows render
  // posters + feed stats. Absent on older clients; the row simply keeps null.
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  firstAirDate?: string | null;
  voteAverage?: number | null;
  overview?: string | null;
  numberOfEpisodes?: number | null;
  numberOfSeasons?: number | null;
}

interface ImportMovie {
  tmdbId: number;
  title: string;
  status: 'watched' | 'watchlist';
  watchedAt: string | null;
  rewatchCount: number;
  // Optional metadata (backward compat) — mirrors what movie-service persists.
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  overview?: string | null;
  voteAverage?: number | null;
  releaseDate?: string | null;
}

interface ImportPayload {
  importKey: string;
  shows: ImportShow[];
  movies: ImportMovie[];
}

interface ImportCounts {
  showsUpserted: number;
  episodesInserted: number;
  episodesSkipped: number;
  episodesInvalid: number;
  moviesInserted: number;
  moviesUpdated: number;
  moviesSkipped: number;
  moviesInvalid: number;
}

// Aggregate ceilings per call — the client chunks, so these bound one request.
const MAX_TOTAL_EPISODES_PER_CALL = 5000;
const MAX_TOTAL_MOVIES_PER_CALL = 2000;
const PG_UNIQUE_VIOLATION = '23505';

function jsonResponse(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// --- Boundary sanitizers ----------------------------------------------------

/** A valid ISO-ish date string canonicalized, or null. Never throws, never
 *  passes a malformed value through to a timestamptz column. */
function sanitizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/** A non-negative integer (season/episode; 0 is valid — specials), or null. */
function sanitizeIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 ? n : null;
}

/** A positive integer tmdb id, or null. */
function sanitizeTmdbId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n > 0 ? n : null;
}

/** A non-empty trimmed string (poster path, overview, air date), or null. */
function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

/** A finite number (vote average, episode/season count), or null. */
function sanitizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** An array of finite integer genre ids (defensive; drops junk). Empty → []. */
function sanitizeGenreIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((g): g is number => typeof g === 'number' && Number.isInteger(g));
}

/** Build the persistable metadata subset for a movie row from the payload.
 *  Only defined keys are returned so an absent field never nulls an existing
 *  value on the self-heal path. */
function movieMetadata(movie: ImportMovie): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const poster = sanitizeString(movie?.posterPath);
  const backdrop = sanitizeString(movie?.backdropPath);
  const overview = sanitizeString(movie?.overview);
  const releaseDate = sanitizeString(movie?.releaseDate);
  const vote = sanitizeNumber(movie?.voteAverage);
  if (poster !== null) meta.poster_path = poster;
  if (backdrop !== null) meta.backdrop_path = backdrop;
  if (overview !== null) meta.overview = overview;
  if (releaseDate !== null) meta.release_date = releaseDate;
  if (vote !== null) meta.vote_average = vote;
  if (Array.isArray(movie?.genreIds) && movie.genreIds.length > 0) {
    meta.genre_ids = sanitizeGenreIds(movie.genreIds);
  }
  return meta;
}

/** Persistable metadata subset for a show row (see {@link movieMetadata}). */
function showMetadata(show: ImportShow): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const poster = sanitizeString(show?.posterPath);
  const backdrop = sanitizeString(show?.backdropPath);
  const overview = sanitizeString(show?.overview);
  const firstAir = sanitizeString(show?.firstAirDate);
  const vote = sanitizeNumber(show?.voteAverage);
  const numEps = sanitizeNumber(show?.numberOfEpisodes);
  const numSeasons = sanitizeNumber(show?.numberOfSeasons);
  if (poster !== null) meta.poster_path = poster;
  if (backdrop !== null) meta.backdrop_path = backdrop;
  if (overview !== null) meta.overview = overview;
  if (firstAir !== null) meta.first_air_date = firstAir;
  if (vote !== null) meta.vote_average = vote;
  if (numEps !== null) meta.number_of_episodes = numEps;
  if (numSeasons !== null) meta.number_of_seasons = numSeasons;
  if (Array.isArray(show?.genreIds) && show.genreIds.length > 0) {
    meta.genre_ids = sanitizeGenreIds(show.genreIds);
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Shows + episodes
// ---------------------------------------------------------------------------
async function importShows(
  admin: SupabaseClient,
  userId: string,
  shows: ImportShow[],
  counts: ImportCounts,
): Promise<void> {
  for (const show of shows) {
    const tmdbShowId = sanitizeTmdbId(show?.tmdbShowId);
    const episodes = Array.isArray(show?.episodes) ? show.episodes : [];
    const favorited = show?.favorited === true;

    // A show we can't key can't take episodes — count them all invalid.
    if (tmdbShowId === null) {
      counts.episodesInvalid += episodes.length;
      continue;
    }

    const { data: existingShow, error: showLookupError } = await admin
      .from('user_tv_shows')
      .select('id, is_liked, poster_path')
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbShowId)
      .maybeSingle();
    if (showLookupError) throw showLookupError;

    const meta = showMetadata(show);

    let userTvShowId: string;
    if (existingShow) {
      userTvShowId = existingShow.id;
      // Build a single UPDATE: (a) upgrade is_liked when favorited (never
      // downgrade true->false); (b) SELF-HEAL — when the existing row has no
      // poster and the payload carries metadata, backfill it. This is the
      // founder's repair path: re-running an import fills every blank poster.
      // Never touches status/watched_at.
      const update: Record<string, unknown> = {};
      if (favorited && existingShow.is_liked !== true) update.is_liked = true;
      if (existingShow.poster_path === null && Object.keys(meta).length > 0) {
        Object.assign(update, meta);
      }
      if (Object.keys(update).length > 0) {
        const { error: updateError } = await admin
          .from('user_tv_shows')
          .update(update)
          .eq('id', existingShow.id);
        if (updateError) throw updateError;
      }
    } else {
      const name = typeof show?.name === 'string' ? show.name.trim() : '';
      // name is NOT NULL — can't create the show without one.
      if (name === '') {
        counts.episodesInvalid += episodes.length;
        continue;
      }
      const { data: insertedShow, error: showInsertError } = await admin
        .from('user_tv_shows')
        .insert({
          user_id: userId,
          tmdb_id: tmdbShowId,
          name,
          status: 'watching',
          is_liked: favorited,
          ...meta,
        })
        .select('id')
        .single();
      if (showInsertError) throw showInsertError;
      userTvShowId = insertedShow.id;
      counts.showsUpserted += 1;
    }

    if (episodes.length === 0) continue;
    await importEpisodesForShow(admin, userId, tmdbShowId, userTvShowId, episodes, counts);
  }
}

async function importEpisodesForShow(
  admin: SupabaseClient,
  userId: string,
  tmdbShowId: number,
  userTvShowId: string,
  episodes: ImportEpisode[],
  counts: ImportCounts,
): Promise<void> {
  // Existing watches for this show — key set is (season, episode). The table's
  // only uniqueness is a PARTIAL index on (user_id, tmdb_show_id, season,
  // episode) WHERE watch_number = 1, which PostgREST .upsert() can't target
  // (it can't express the WHERE predicate), so we select-then-insert.
  const { data: existingWatches, error: watchLookupError } = await admin
    .from('user_episode_watches')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId);
  if (watchLookupError) throw watchLookupError;

  const present = new Set<string>(
    (existingWatches ?? []).map((w) => `${w.season_number}:${w.episode_number}`),
  );

  const rows: Record<string, unknown>[] = [];
  const seenInPayload = new Set<string>();
  for (const ep of episodes) {
    const season = sanitizeIndex(ep?.season);
    const episode = sanitizeIndex(ep?.episode);
    if (season === null || episode === null) {
      counts.episodesInvalid += 1;
      continue;
    }
    const key = `${season}:${episode}`;
    if (present.has(key) || seenInPayload.has(key)) {
      counts.episodesSkipped += 1;
      continue;
    }
    seenInPayload.add(key);
    rows.push({
      user_id: userId,
      user_tv_show_id: userTvShowId,
      tmdb_show_id: tmdbShowId,
      season_number: season,
      episode_number: episode,
      watched_at: sanitizeDate(ep?.watchedAt),
      watch_number: 1,
      source: 'tvtime_import',
    });
  }

  if (rows.length === 0) return;

  const { error: insertError } = await admin.from('user_episode_watches').insert(rows);
  if (!insertError) {
    counts.episodesInserted += rows.length;
    return;
  }

  // Concurrency/retry backstop: a racing writer may have inserted a
  // watch_number=1 row between our SELECT and INSERT, tripping the partial
  // unique index. Re-derive what's still missing; anything now present is a
  // skip. Then insert the remainder per-row so one genuinely bad row can't
  // strand its neighbours.
  if (insertError.code === PG_UNIQUE_VIOLATION) {
    const { data: recheck, error: recheckError } = await admin
      .from('user_episode_watches')
      .select('season_number, episode_number')
      .eq('user_id', userId)
      .eq('tmdb_show_id', tmdbShowId);
    if (recheckError) throw recheckError;
    const nowPresent = new Set<string>(
      (recheck ?? []).map((w) => `${w.season_number}:${w.episode_number}`),
    );
    const stillMissing = rows.filter(
      (r) => !nowPresent.has(`${r.season_number}:${r.episode_number}`),
    );
    counts.episodesSkipped += rows.length - stillMissing.length;
    await insertEpisodesPerRow(admin, stillMissing, counts);
    return;
  }

  // Unexpected error on the batch — isolate the offender row-by-row.
  await insertEpisodesPerRow(admin, rows, counts);
}

/** Per-row insert fallback: isolates a single failing row from its batch.
 *  23505 -> already present (skip); any other error -> invalid. */
async function insertEpisodesPerRow(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
  counts: ImportCounts,
): Promise<void> {
  for (const row of rows) {
    const { error } = await admin.from('user_episode_watches').insert(row);
    if (!error) counts.episodesInserted += 1;
    else if (error.code === PG_UNIQUE_VIOLATION) counts.episodesSkipped += 1;
    else counts.episodesInvalid += 1;
  }
}

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------
async function importMovies(
  admin: SupabaseClient,
  userId: string,
  movies: ImportMovie[],
  counts: ImportCounts,
): Promise<void> {
  for (const movie of movies) {
    const tmdbId = sanitizeTmdbId(movie?.tmdbId);
    const title = typeof movie?.title === 'string' ? movie.title.trim() : '';
    const status = movie?.status;
    // NOT NULL title, keyable id, and a valid status enum are all required —
    // a bad row is counted invalid, never silently coerced.
    if (tmdbId === null || title === '' || (status !== 'watched' && status !== 'watchlist')) {
      counts.moviesInvalid += 1;
      continue;
    }
    await processMovie(admin, userId, tmdbId, title, status, sanitizeDate(movie?.watchedAt), movieMetadata(movie), counts, true);
  }
}

async function processMovie(
  admin: SupabaseClient,
  userId: string,
  tmdbId: number,
  title: string,
  status: 'watched' | 'watchlist',
  watchedAt: string | null,
  meta: Record<string, unknown>,
  counts: ImportCounts,
  allowRetry: boolean,
): Promise<void> {
  const wantWatched = status === 'watched';

  // user_movies has NO unique (user_id, tmdb_id) constraint — multiple journey
  // rows can exist. Order deterministically so the upgrade target is stable.
  const { data: existingRows, error: lookupError } = await admin
    .from('user_movies')
    .select('id, status, watched_at, poster_path')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .order('watched_at', { ascending: false, nullsFirst: false })
    .order('added_at', { ascending: false });
  if (lookupError) throw lookupError;

  const hasAnyRow = (existingRows?.length ?? 0) > 0;
  const hasWatchedRow = (existingRows ?? []).some((r) => r.status === 'watched');

  // SELF-HEAL (founder repair path): backfill metadata onto any existing rows
  // for this movie that have no poster. One UPDATE scoped to poster_path IS
  // NULL; never touches status/watched_at. Best-effort — a heal failure must
  // not fail the import.
  if (hasAnyRow && Object.keys(meta).length > 0 && (existingRows ?? []).some((r) => r.poster_path === null)) {
    await admin
      .from('user_movies')
      .update(meta)
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbId)
      .is('poster_path', null);
  }

  if (!hasAnyRow) {
    const { error: insertError } = await admin.from('user_movies').insert({
      user_id: userId,
      tmdb_id: tmdbId,
      title,
      status: wantWatched ? 'watched' : 'watchlist',
      watched_at: wantWatched ? watchedAt : null,
      source: 'tvtime_import',
      ...meta,
    });
    if (!insertError) {
      counts.moviesInserted += 1;
      return;
    }
    // Concurrent import of the same movie won the race (partial unique index
    // on source='tvtime_import', or the journey index). Re-decide once.
    if (insertError.code === PG_UNIQUE_VIOLATION && allowRetry) {
      await processMovie(admin, userId, tmdbId, title, status, watchedAt, meta, counts, false);
      return;
    }
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      counts.moviesSkipped += 1;
      return;
    }
    counts.moviesInvalid += 1;
    return;
  }

  // A watchlist import never overwrites/downgrades anything; a watched import
  // upgrades an existing non-watched row to watched but never touches an
  // already-watched row (no downgrade, no duplicate).
  if (!wantWatched || hasWatchedRow) {
    counts.moviesSkipped += 1;
    return;
  }

  // Upgrade the strongest existing (non-watched) row to watched. Leave `source`
  // untouched — the row originated organically; do not relabel it an import.
  const target = existingRows![0];
  const update: Record<string, unknown> = { status: 'watched' };
  if (!target.watched_at && watchedAt) update.watched_at = watchedAt;

  const { error: updateError } = await admin
    .from('user_movies')
    .update(update)
    .eq('id', target.id);
  if (updateError) {
    counts.moviesInvalid += 1;
    return;
  }
  counts.moviesUpdated += 1;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse(req, { error: 'Authorization required' }, 401);
    }

    // Resolve the caller from their JWT, then scope every write to their id.
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse(req, { error: 'Invalid authorization token' }, 401);
    }

    // Generous ceiling — a full import is chunked into many calls.
    const rateLimited = await enforceRateLimit(user.id, 'import_tvtime', 300, 3600, req);
    if (rateLimited) return rateLimited;

    let payload: ImportPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(req, { error: 'Invalid JSON body' }, 400);
    }

    if (!payload || typeof payload.importKey !== 'string' || payload.importKey.length === 0) {
      return jsonResponse(req, { error: 'importKey is required' }, 400);
    }
    const shows = Array.isArray(payload.shows) ? payload.shows : [];
    const movies = Array.isArray(payload.movies) ? payload.movies : [];

    // Aggregate size guard — bound total work per call (client chunks).
    const totalEpisodes = shows.reduce(
      (sum, s) => sum + (Array.isArray(s?.episodes) ? s.episodes.length : 0),
      0,
    );
    if (totalEpisodes > MAX_TOTAL_EPISODES_PER_CALL || movies.length > MAX_TOTAL_MOVIES_PER_CALL) {
      return jsonResponse(
        req,
        { error: 'chunk_too_large', maxEpisodes: MAX_TOTAL_EPISODES_PER_CALL, maxMovies: MAX_TOTAL_MOVIES_PER_CALL },
        413,
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const counts: ImportCounts = {
      showsUpserted: 0,
      episodesInserted: 0,
      episodesSkipped: 0,
      episodesInvalid: 0,
      moviesInserted: 0,
      moviesUpdated: 0,
      moviesSkipped: 0,
      moviesInvalid: 0,
    };

    await importShows(admin, user.id, shows, counts);
    await importMovies(admin, user.id, movies, counts);

    // Counts + importKey only. No titles / row content.
    console.log(`[import-tvtime] key=${payload.importKey} ${JSON.stringify(counts)}`);

    return jsonResponse(req, counts, 200);
  } catch (error) {
    // Log the pg error code where present; never the payload.
    const code = (error as { code?: string })?.code ?? 'unknown';
    console.error(`[import-tvtime] Unhandled error code=${code}`);
    return jsonResponse(req, { error: 'Internal server error' }, 500);
  }
});
