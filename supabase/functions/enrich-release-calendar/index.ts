import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { selectBestTrailer, type TMDBVideosResponse } from '../_shared/select-best-trailer.ts';
import { DEFAULT_MONTHS_AHEAD, getReleaseCalendarWindow } from '../_shared/release-calendar-window.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface RequestBody {
  tmdb_id?: number;
  region?: string;
}

interface TMDBReleaseDateEntry {
  release_date: string;
  type: number;
  certification: string;
  note: string;
}

interface TMDBReleaseDatesResponse {
  results: Array<{
    iso_3166_1: string;
    release_dates: TMDBReleaseDateEntry[];
  }>;
}

interface TMDBMovieDetail {
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number }[];
  vote_average: number | null;
  popularity: number | null;
}

interface MovieMeta {
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
  popularity: number | null;
}

interface ReleaseCalendarUpsertRow {
  tmdb_id: number;
  region: string;
  release_type: number;
  release_date: string;
  certification: string | null;
  note: string | null;
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
  popularity: number | null;
  fetched_at: string;
  trailer_youtube_key: string | null;
}

/**
 * Pure: parse TMDB /movie/{id}/release_dates response → release_calendar rows.
 * Filters to the requested region and to the [windowStart, windowEnd] forward
 * window (inclusive, YYYY-MM-DD) so this writer can't emit the historical /
 * re-release rows that warm-release-calendar never would — the two writers
 * share one envelope (see _shared/release-calendar-window.ts). Dedups on
 * (tmdb_id, region, release_type) preferring entries with populated
 * certification (matches warm-release-calendar — TMDB sometimes returns
 * duplicates differing only in cert).
 */
function buildRowsFromTMDB(
  response: TMDBReleaseDatesResponse,
  tmdbId: number,
  region: string,
  meta: MovieMeta,
  trailerKey: string | null,
  windowStart: string,
  windowEnd: string,
): ReleaseCalendarUpsertRow[] {
  const regional = response.results.find((r) => r.iso_3166_1 === region);
  if (!regional) return [];

  const fetchedAt = new Date().toISOString();
  const byKey = new Map<string, ReleaseCalendarUpsertRow>();
  for (const entry of regional.release_dates) {
    const releaseDate = entry.release_date.slice(0, 10);
    if (releaseDate < windowStart || releaseDate > windowEnd) continue;
    const row: ReleaseCalendarUpsertRow = {
      tmdb_id: tmdbId,
      region,
      release_type: entry.type,
      release_date: releaseDate,
      certification: entry.certification || null,
      note: entry.note || null,
      title: meta.title,
      poster_path: meta.poster_path,
      backdrop_path: meta.backdrop_path,
      genre_ids: meta.genre_ids,
      vote_average: meta.vote_average,
      popularity: meta.popularity,
      fetched_at: fetchedAt,
      trailer_youtube_key: trailerKey,
    };
    const key = `${row.tmdb_id}:${row.region}:${row.release_type}`;
    const existing = byKey.get(key);
    if (!existing || (!existing.certification && row.certification)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const corsHeaders = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const tmdbId = body.tmdb_id;
    const region = (body.region ?? 'US').toUpperCase();

    if (!Number.isInteger(tmdbId) || (tmdbId as number) <= 0) {
      return new Response(
        JSON.stringify({ error: 'tmdb_id must be a positive integer' }),
        { status: 400, headers: corsHeaders }
      );
    }
    if (!/^[A-Z]{2}$/.test(region)) {
      return new Response(
        JSON.stringify({ error: 'region must be a 2-character ISO 3166-1 alpha-2 code' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const releaseDatesUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
    const videosUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
    // Fetch /movie/{id} alongside — static metadata used to (a) source
    // popularity for every row and (b) fall back for title/poster/genres/vote
    // when the local movies cache misses. Cheap and always safe to fetch.
    const detailUrl = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const [tmdbRes, tmdbVideosRes, tmdbDetailRes] = await Promise.all([
      fetch(releaseDatesUrl),
      fetch(videosUrl),
      fetch(detailUrl),
    ]);
    if (tmdbRes.status === 404) {
      console.log(`[enrich-release-calendar] tmdb_id ${tmdbId} not found in TMDB`);
      return new Response(
        JSON.stringify({ inserted: 0, region, tmdb_id: tmdbId }),
        { status: 200, headers: corsHeaders }
      );
    }
    if (!tmdbRes.ok) {
      console.error(`[enrich-release-calendar] TMDB ${tmdbRes.status} for ${tmdbId}`);
      return new Response(
        JSON.stringify({ error: `TMDB returned ${tmdbRes.status}`, inserted: 0 }),
        { status: 502, headers: corsHeaders }
      );
    }
    const tmdbResponse = (await tmdbRes.json()) as TMDBReleaseDatesResponse;

    let trailerKey: string | null = null;
    if (tmdbVideosRes.ok) {
      try {
        const videosResponse = (await tmdbVideosRes.json()) as TMDBVideosResponse;
        trailerKey = selectBestTrailer(videosResponse);
      } catch (e) {
        console.warn(
          `[enrich-release-calendar] videos parse failed for ${tmdbId}:`,
          e
        );
      }
    } else {
      console.warn(
        `[enrich-release-calendar] videos fetch failed for ${tmdbId}: ${tmdbVideosRes.status}`
      );
    }

    let detail: TMDBMovieDetail | null = null;
    if (tmdbDetailRes.ok) {
      try {
        detail = (await tmdbDetailRes.json()) as TMDBMovieDetail;
      } catch (e) {
        console.warn(
          `[enrich-release-calendar] detail parse failed for ${tmdbId}:`,
          e
        );
      }
    } else {
      console.warn(
        `[enrich-release-calendar] detail fetch failed for ${tmdbId}: ${tmdbDetailRes.status}`
      );
    }

    const { data: movieRow, error: movieErr } = await supabase
      .from('movies')
      .select('title, poster_path, backdrop_path, genre_ids, tmdb_vote_average')
      .eq('tmdb_id', tmdbId)
      .maybeSingle();
    if (movieErr) {
      // Best-effort lookup — fall through to TMDB detail. Warn so RLS or
      // transient DB errors don't silently degrade calendar metadata.
      console.warn(
        `[enrich-release-calendar] movies lookup failed for ${tmdbId}:`,
        movieErr
      );
    }

    // Prefer the local movies cache; fall back to TMDB /movie/{id} on a miss
    // (or a null-title cache row). popularity always comes from TMDB detail —
    // the movies cache doesn't carry it.
    const detailGenreIds = detail?.genres?.map((g) => g.id) ?? null;
    const meta: MovieMeta = {
      title: movieRow?.title ?? detail?.title ?? null,
      poster_path: movieRow?.poster_path ?? detail?.poster_path ?? null,
      backdrop_path: movieRow?.backdrop_path ?? detail?.backdrop_path ?? null,
      genre_ids: movieRow?.genre_ids ?? detailGenreIds,
      vote_average: movieRow?.tmdb_vote_average ?? detail?.vote_average ?? null,
      popularity: detail?.popularity ?? null,
    };

    // Prevention invariant: no writer may insert a title-less row. If even the
    // TMDB detail fallback couldn't supply a title, skip the write entirely —
    // a null-title row is unreachable junk (client hides it, warm's
    // reconciliation only fixes rows inside its own window).
    if (!meta.title) {
      console.warn(
        `[enrich-release-calendar] no title for ${tmdbId} (cache miss + detail unavailable) — skipping insert`
      );
      return new Response(
        JSON.stringify({ inserted: 0, region, tmdb_id: tmdbId }),
        { status: 200, headers: corsHeaders }
      );
    }

    const { startDate: windowStart, endDate: windowEnd } = getReleaseCalendarWindow(
      new Date(),
      DEFAULT_MONTHS_AHEAD,
    );
    const rows = buildRowsFromTMDB(
      tmdbResponse,
      tmdbId as number,
      region,
      meta,
      trailerKey,
      windowStart,
      windowEnd,
    );
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, region, tmdb_id: tmdbId }),
        { status: 200, headers: corsHeaders }
      );
    }

    const { error: upsertErr } = await supabase
      .from('release_calendar')
      .upsert(rows, { onConflict: 'tmdb_id,region,release_type' });

    if (upsertErr) {
      console.error(`[enrich-release-calendar] upsert failed for ${tmdbId}:`, upsertErr);
      return new Response(
        JSON.stringify({ error: upsertErr.message, inserted: 0 }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log(
      `[enrich-release-calendar] tmdb_id=${tmdbId} region=${region} rows=${rows.length}`
    );
    return new Response(
      JSON.stringify({ inserted: rows.length, region, tmdb_id: tmdbId }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[enrich-release-calendar]', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
