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
}

interface ImportMovie {
  tmdbId: number;
  title: string;
  status: 'watched' | 'watchlist';
  watchedAt: string | null;
  rewatchCount: number;
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
  moviesInserted: number;
  moviesUpdated: number;
  moviesSkipped: number;
}

// Guardrails against a malformed or abusive single call. The client chunks, so
// these are per-call ceilings, not per-import.
const MAX_SHOWS_PER_CALL = 500;
const MAX_MOVIES_PER_CALL = 1000;
const MAX_EPISODES_PER_SHOW = 5000;
const PG_UNIQUE_VIOLATION = '23505';

function jsonResponse(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
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
    // Ensure a user_tv_shows row. Preserve the user's existing status if they
    // already track this show; otherwise create it as 'watching'. (No source
    // column on this table — provenance lives on the episode/movie rows.)
    const { data: existingShow, error: showLookupError } = await admin
      .from('user_tv_shows')
      .select('id')
      .eq('user_id', userId)
      .eq('tmdb_id', show.tmdbShowId)
      .maybeSingle();
    if (showLookupError) throw showLookupError;

    let userTvShowId: string;
    if (existingShow) {
      userTvShowId = existingShow.id;
    } else {
      const { data: insertedShow, error: showInsertError } = await admin
        .from('user_tv_shows')
        .insert({
          user_id: userId,
          tmdb_id: show.tmdbShowId,
          name: show.name,
          status: 'watching',
          is_liked: show.favorited === true,
        })
        .select('id')
        .single();
      if (showInsertError) throw showInsertError;
      userTvShowId = insertedShow.id;
      counts.showsUpserted += 1;
    }

    if (!Array.isArray(show.episodes) || show.episodes.length === 0) continue;

    await importEpisodesForShow(admin, userId, show, userTvShowId, counts);
  }
}

async function importEpisodesForShow(
  admin: SupabaseClient,
  userId: string,
  show: ImportShow,
  userTvShowId: string,
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
    .eq('tmdb_show_id', show.tmdbShowId);
  if (watchLookupError) throw watchLookupError;

  const present = new Set<string>(
    (existingWatches ?? []).map((w) => `${w.season_number}:${w.episode_number}`),
  );

  const rows: Record<string, unknown>[] = [];
  const seenInPayload = new Set<string>();
  for (const ep of show.episodes) {
    if (
      typeof ep.season !== 'number' ||
      typeof ep.episode !== 'number' ||
      !Number.isFinite(ep.season) ||
      !Number.isFinite(ep.episode)
    ) {
      continue;
    }
    const key = `${ep.season}:${ep.episode}`;
    // Already logged, or duplicated within this payload chunk → skip.
    if (present.has(key) || seenInPayload.has(key)) {
      counts.episodesSkipped += 1;
      continue;
    }
    seenInPayload.add(key);
    rows.push({
      user_id: userId,
      user_tv_show_id: userTvShowId,
      tmdb_show_id: show.tmdbShowId,
      season_number: ep.season,
      episode_number: ep.episode,
      watched_at: ep.watchedAt ?? null,
      watch_number: 1,
      source: 'tvtime_import',
    });
  }

  if (rows.length === 0) return;

  const { error: insertError } = await admin
    .from('user_episode_watches')
    .insert(rows);

  if (!insertError) {
    counts.episodesInserted += rows.length;
    return;
  }

  // Concurrency/retry backstop: a racing writer (or an overlapping retried
  // chunk) may have inserted a watch_number=1 row between our SELECT and
  // INSERT, tripping the partial unique index. Re-derive what's still missing
  // and insert only those; anything now present counts as skipped.
  if (insertError.code === PG_UNIQUE_VIOLATION) {
    const { data: recheck, error: recheckError } = await admin
      .from('user_episode_watches')
      .select('season_number, episode_number')
      .eq('user_id', userId)
      .eq('tmdb_show_id', show.tmdbShowId);
    if (recheckError) throw recheckError;

    const nowPresent = new Set<string>(
      (recheck ?? []).map((w) => `${w.season_number}:${w.episode_number}`),
    );
    const stillMissing = rows.filter(
      (r) => !nowPresent.has(`${r.season_number}:${r.episode_number}`),
    );
    counts.episodesSkipped += rows.length - stillMissing.length;

    if (stillMissing.length > 0) {
      const { error: retryError } = await admin
        .from('user_episode_watches')
        .insert(stillMissing);
      if (retryError) throw retryError;
      counts.episodesInserted += stillMissing.length;
    }
    return;
  }

  throw insertError;
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
    if (typeof movie.tmdbId !== 'number' || !Number.isFinite(movie.tmdbId)) continue;
    const wantWatched = movie.status === 'watched';

    // user_movies has NO unique constraint on (user_id, tmdb_id) — multiple
    // rows can exist (journeys). Treat "any row" as already-in-library and
    // apply the terminal-state-set rule against the strongest existing status.
    const { data: existingRows, error: lookupError } = await admin
      .from('user_movies')
      .select('id, status, watched_at')
      .eq('user_id', userId)
      .eq('tmdb_id', movie.tmdbId);
    if (lookupError) throw lookupError;

    const hasAnyRow = (existingRows?.length ?? 0) > 0;
    const hasWatchedRow = (existingRows ?? []).some((r) => r.status === 'watched');

    if (!hasAnyRow) {
      const { error: insertError } = await admin.from('user_movies').insert({
        user_id: userId,
        tmdb_id: movie.tmdbId,
        title: movie.title,
        status: wantWatched ? 'watched' : 'watchlist',
        watched_at: wantWatched ? (movie.watchedAt ?? null) : null,
        source: 'tvtime_import',
      });
      if (insertError) throw insertError;
      counts.moviesInserted += 1;
      continue;
    }

    // Existing row(s). A watchlist import never overwrites/downgrades anything.
    // A watched import upgrades an existing non-watched row to watched, but
    // never touches an already-watched row (no downgrade, no duplicate).
    if (!wantWatched || hasWatchedRow) {
      counts.moviesSkipped += 1;
      continue;
    }

    // Upgrade the existing watchlist/watching row to watched. Leave `source`
    // untouched — the row originated organically; do not retroactively relabel
    // it as an import. Only fill watched_at if it's currently empty.
    const target = existingRows![0];
    const update: Record<string, unknown> = { status: 'watched' };
    if (!target.watched_at && movie.watchedAt) update.watched_at = movie.watchedAt;

    const { error: updateError } = await admin
      .from('user_movies')
      .update(update)
      .eq('id', target.id);
    if (updateError) throw updateError;
    counts.moviesUpdated += 1;
  }
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

    if (shows.length > MAX_SHOWS_PER_CALL || movies.length > MAX_MOVIES_PER_CALL) {
      return jsonResponse(req, { error: 'Chunk too large' }, 413);
    }
    for (const s of shows) {
      if (
        typeof s?.tmdbShowId !== 'number' ||
        typeof s?.name !== 'string' ||
        (Array.isArray(s?.episodes) && s.episodes.length > MAX_EPISODES_PER_SHOW)
      ) {
        return jsonResponse(req, { error: 'Malformed show entry' }, 400);
      }
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const counts: ImportCounts = {
      showsUpserted: 0,
      episodesInserted: 0,
      episodesSkipped: 0,
      moviesInserted: 0,
      moviesUpdated: 0,
      moviesSkipped: 0,
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
