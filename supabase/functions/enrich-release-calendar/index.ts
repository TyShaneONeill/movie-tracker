import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

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

interface MovieMeta {
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
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
}

/**
 * Pure: parse TMDB /movie/{id}/release_dates response → release_calendar rows.
 * Filters to the requested region. Dedups on (tmdb_id, region, release_type)
 * preferring entries with populated certification (matches warm-release-calendar
 * worker behavior — TMDB sometimes returns duplicates differing only in cert).
 */
function buildRowsFromTMDB(
  response: TMDBReleaseDatesResponse,
  tmdbId: number,
  region: string,
  meta: MovieMeta,
): ReleaseCalendarUpsertRow[] {
  const regional = response.results.find((r) => r.iso_3166_1 === region);
  if (!regional) return [];

  const byKey = new Map<string, ReleaseCalendarUpsertRow>();
  for (const entry of regional.release_dates) {
    const row: ReleaseCalendarUpsertRow = {
      tmdb_id: tmdbId,
      region,
      release_type: entry.type,
      release_date: entry.release_date.slice(0, 10),
      certification: entry.certification || null,
      note: entry.note || null,
      title: meta.title,
      poster_path: meta.poster_path,
      backdrop_path: meta.backdrop_path,
      genre_ids: meta.genre_ids,
      vote_average: meta.vote_average,
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

    const tmdbUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
    const tmdbRes = await fetch(tmdbUrl);
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

    const { data: movieRow } = await supabase
      .from('movies')
      .select('title, poster_path, backdrop_path, genre_ids, tmdb_vote_average')
      .eq('tmdb_id', tmdbId)
      .maybeSingle();

    const meta: MovieMeta = {
      title: movieRow?.title ?? null,
      poster_path: movieRow?.poster_path ?? null,
      backdrop_path: movieRow?.backdrop_path ?? null,
      genre_ids: movieRow?.genre_ids ?? null,
      vote_average: movieRow?.tmdb_vote_average ?? null,
    };

    const rows = buildRowsFromTMDB(tmdbResponse, tmdbId as number, region, meta);
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
