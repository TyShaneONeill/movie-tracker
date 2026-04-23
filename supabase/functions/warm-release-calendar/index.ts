import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_DISCOVER_PAGES = 5;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 250;

interface RequestBody {
  months_ahead?: number;
  region?: string;
}

interface DiscoverMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
}

interface ReleaseDateEntry {
  release_date: string;
  type: number;
  certification: string;
  note: string;
}

interface ReleaseCalendarRow {
  tmdb_id: number;
  region: string;
  release_type: number;
  release_date: string;
  certification: string | null;
  note: string | null;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
  fetched_at: string;
}

interface ResponseBody {
  rows_upserted: number;
  months_warmed: string[];
  duration_ms: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const started = Date.now();

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const monthsAhead = Math.max(0, Math.min(6, body.months_ahead ?? 3));
    const region = (body.region ?? 'US').toUpperCase();

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthsWarmed: string[] = [];
    const allRows: ReleaseCalendarRow[] = [];

    for (let i = 0; i <= monthsAhead; i++) {
      const target = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
      const year = target.getFullYear();
      const month = target.getMonth() + 1;
      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
      monthsWarmed.push(monthLabel);

      const startDate = `${monthLabel}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${monthLabel}-${String(lastDay).padStart(2, '0')}`;

      console.log(`[warm-release-calendar] Warming ${monthLabel} region=${region}`);

      const allMovies: DiscoverMovie[] = [];
      for (let page = 1; page <= MAX_DISCOVER_PAGES; page++) {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&region=${region}&sort_by=primary_release_date.asc&page=${page}`;
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`[warm-release-calendar] discover page ${page} failed: ${res.status}`);
          break;
        }
        const data = await res.json();
        allMovies.push(...data.results);
        if (page >= data.total_pages) break;
      }

      for (let i2 = 0; i2 < allMovies.length; i2 += BATCH_SIZE) {
        const batch = allMovies.slice(i2, i2 + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (movie) => {
          try {
            const url = `${TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${TMDB_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            const country = data.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === region);
            if (!country) return null;
            return { movie, entries: country.release_dates as ReleaseDateEntry[] };
          } catch (e) {
            console.error(`[warm-release-calendar] release_dates fetch failed for ${movie.id}:`, e);
            return null;
          }
        }));

        for (const result of results) {
          if (!result) continue;
          for (const entry of result.entries) {
            const releaseDate = entry.release_date.split('T')[0];
            if (releaseDate < startDate || releaseDate > endDate) continue;
            allRows.push({
              tmdb_id: result.movie.id,
              region,
              release_type: entry.type,
              release_date: releaseDate,
              certification: entry.certification || null,
              note: entry.note || null,
              title: result.movie.title,
              poster_path: result.movie.poster_path,
              backdrop_path: result.movie.backdrop_path,
              // Pass nulls through instead of coercing — schema is nullable
              // and downstream consumers handle missing values at render time
              // (null vs 0 distinguishes unrated films from 0-rated films).
              genre_ids: result.movie.genre_ids ?? null,
              vote_average: result.movie.vote_average ?? null,
              fetched_at: new Date().toISOString(),
            });
          }
        }

        if (i2 + BATCH_SIZE < allMovies.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    }

    // Dedup on (tmdb_id, region, release_type) — TMDB sometimes returns
    // multiple entries for the same composite key (one with certification,
    // one without). Prefer the entry with a populated certification so
    // we don't silently drop MPAA badges.
    const byKey = new Map<string, ReleaseCalendarRow>();
    for (const row of allRows) {
      const key = `${row.tmdb_id}:${row.region}:${row.release_type}`;
      const existing = byKey.get(key);
      if (!existing || (!existing.certification && row.certification)) {
        byKey.set(key, row);
      }
    }
    const deduped = [...byKey.values()];

    if (deduped.length > 0) {
      const { error } = await supabase
        .from('release_calendar')
        .upsert(deduped, { onConflict: 'tmdb_id,region,release_type' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }

    const response: ResponseBody = {
      rows_upserted: deduped.length,
      months_warmed: monthsWarmed,
      duration_ms: Date.now() - started,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[warm-release-calendar]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
