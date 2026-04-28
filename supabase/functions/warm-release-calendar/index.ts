import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { selectBestTrailer, type TMDBVideosResponse } from '../_shared/select-best-trailer.ts';

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
  trailer_youtube_key: string | null;
}

interface ResponseBody {
  rows_upserted: number;
  rows_reconciled: number;  // NEW: count of null-title rows fixed via /movie/{id}
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
            const [releaseDatesRes, videosRes] = await Promise.all([
              fetch(`${TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${TMDB_API_KEY}`),
              fetch(`${TMDB_BASE_URL}/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`),
            ]);

            if (!releaseDatesRes.ok) return null;
            const releaseDatesData = await releaseDatesRes.json();
            const country = releaseDatesData.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === region);
            if (!country) return null;

            let trailerKey: string | null = null;
            if (videosRes.ok) {
              try {
                const videosData = (await videosRes.json()) as TMDBVideosResponse;
                trailerKey = selectBestTrailer(videosData);
              } catch (e) {
                console.warn(`[warm-release-calendar] videos parse failed for ${movie.id}:`, e);
              }
            } else {
              console.warn(`[warm-release-calendar] videos fetch failed for ${movie.id}: ${videosRes.status}`);
            }

            return { movie, entries: country.release_dates as ReleaseDateEntry[], trailerKey };
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
              trailer_youtube_key: result.trailerKey,
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

    // === Reconciliation pass ===
    // Fix null-title rows in the warm window by fetching /movie/{id} directly.
    // Bypasses the discover-API popularity ceiling: rows for movies that have
    // fallen out of TMDB's monthly top-100 (or pre-SP1 legacy rows that were
    // never in `movies` table) get their metadata populated here.
    // Idempotent — re-runs converge any remaining null-title rows over time.
    const warmStart = `${monthsWarmed[0]}-01`;
    const lastMonthLabel = monthsWarmed[monthsWarmed.length - 1];
    const [lastYear, lastMonthNum] = lastMonthLabel.split('-').map(Number);
    const lastDayOfWindow = new Date(lastYear, lastMonthNum, 0).getDate();
    const warmEnd = `${lastMonthLabel}-${String(lastDayOfWindow).padStart(2, '0')}`;

    // Select release_date in addition to the conflict-key columns. The upsert
    // payload needs release_date because it's NOT NULL with no default — if
    // omitted, the INSERT path of `INSERT ... ON CONFLICT DO UPDATE` fails the
    // not-null constraint *before* conflict resolution runs, silently aborting
    // every row. Pass-through value: same as queried, so the UPDATE clause
    // writes it back unchanged. (certification, note, fetched_at are nullable;
    // omitting them is fine — they're preserved by being absent from the SET clause.)
    const { data: nullTitleRows, error: queryErr } = await supabase
      .from('release_calendar')
      .select('tmdb_id, region, release_type, release_date')
      .is('title', null)
      .eq('region', region)
      .gte('release_date', warmStart)
      .lte('release_date', warmEnd);

    let rowsReconciled = 0;
    if (queryErr) {
      console.error('[warm-release-calendar] reconciliation query failed:', queryErr);
    } else if (nullTitleRows && nullTitleRows.length > 0) {
      console.log(
        `[warm-release-calendar] Reconciling ${nullTitleRows.length} null-title rows for region=${region}`
      );

      const reconciliationRows: Array<Pick<
        ReleaseCalendarRow,
        | 'tmdb_id'
        | 'region'
        | 'release_type'
        | 'release_date'
        | 'title'
        | 'poster_path'
        | 'backdrop_path'
        | 'genre_ids'
        | 'vote_average'
      >> = [];

      for (let r = 0; r < nullTitleRows.length; r += BATCH_SIZE) {
        const batch = nullTitleRows.slice(r, r + BATCH_SIZE);
        const fetchResults = await Promise.all(
          batch.map(async (stuck) => {
            try {
              const url = `${TMDB_BASE_URL}/movie/${stuck.tmdb_id}?api_key=${TMDB_API_KEY}`;
              const detailRes = await fetch(url);
              if (!detailRes.ok) {
                // 404 = unknown id; 429 = rate-limit; 5xx = TMDB hiccup. Retry next run.
                console.warn(
                  `[warm-release-calendar] reconcile fetch failed for ${stuck.tmdb_id}: ${detailRes.status}`
                );
                return null;
              }
              const detail = (await detailRes.json()) as {
                title: string;
                poster_path: string | null;
                backdrop_path: string | null;
                genres: { id: number }[];
                vote_average: number | null;
              };
              if (!detail.title) return null; // empty title → still un-fixable

              return {
                tmdb_id: stuck.tmdb_id,
                region: stuck.region,
                release_type: stuck.release_type,
                release_date: stuck.release_date, // passthrough — required for INSERT NOT NULL
                title: detail.title,
                poster_path: detail.poster_path,
                backdrop_path: detail.backdrop_path,
                genre_ids: detail.genres?.map((g) => g.id) ?? null,
                vote_average: detail.vote_average ?? null,
              };
            } catch (e) {
              console.error(
                `[warm-release-calendar] reconcile fetch threw for ${stuck.tmdb_id}:`,
                e
              );
              return null;
            }
          })
        );

        for (const result of fetchResults) {
          if (result) reconciliationRows.push(result);
        }

        if (r + BATCH_SIZE < nullTitleRows.length) {
          await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
        }
      }

      if (reconciliationRows.length > 0) {
        // Upsert with onConflict triggers UPDATE for existing rows; the SET
        // clause only includes columns in the payload, so release_date,
        // certification, note, and fetched_at are preserved (not overwritten
        // with NULL or now()).
        const { error: reconcileErr } = await supabase
          .from('release_calendar')
          .upsert(reconciliationRows, {
            onConflict: 'tmdb_id,region,release_type',
            ignoreDuplicates: false,
          });
        if (reconcileErr) {
          console.error(
            '[warm-release-calendar] reconcile upsert failed:',
            reconcileErr
          );
        } else {
          rowsReconciled = reconciliationRows.length;
          console.log(
            `[warm-release-calendar] Reconciled ${rowsReconciled} rows from ${nullTitleRows.length} attempted`
          );
        }
      }
    }
    // === end reconciliation pass ===

    const response: ResponseBody = {
      rows_upserted: deduped.length,
      rows_reconciled: rowsReconciled,
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
