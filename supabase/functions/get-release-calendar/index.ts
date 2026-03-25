import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: 'Premiere',
  2: 'Limited Theatrical',
  3: 'Theatrical',
  4: 'Digital',
  5: 'Physical',
  6: 'TV',
};
const CACHE_TTL_HOURS = 24;
const MAX_DISCOVER_PAGES = 5;

interface RequestBody {
  month: number;
  year: number;
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

interface CalendarRelease {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_type: number;
  release_type_label: string;
  genre_ids: number[];
  vote_average: number;
  release_date: string;
}

interface CalendarDay {
  date: string;
  releases: CalendarRelease[];
}

interface ReleaseCalendarResponse {
  days: CalendarDay[];
  dates_with_releases: string[];
  total_results: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { month, year, region = 'US' } = await req.json() as RequestBody;

    if (!month || !year || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: 'Invalid month or year' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Check cache freshness
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data: cachedEntries } = await supabase
      .from('release_date_cache')
      .select('tmdb_id')
      .eq('region', region)
      .gte('release_date', startDate)
      .lte('release_date', endDate)
      .gte('fetched_at', cacheThreshold)
      .limit(1);

    const hasFreshCache = cachedEntries && cachedEntries.length > 0;

    // Movie info map: tmdb_id -> basic movie info
    const movieMap = new Map<number, {
      title: string;
      poster_path: string | null;
      backdrop_path: string | null;
      genre_ids: number[];
      vote_average: number;
    }>();

    if (!hasFreshCache) {
      console.log(`[get-release-calendar] Cache miss for ${year}-${month}, region=${region}. Fetching from TMDB...`);

      // Step 1: Discover movies releasing this month
      const allMovies: DiscoverMovie[] = [];
      for (let page = 1; page <= MAX_DISCOVER_PAGES; page++) {
        const discoverUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&region=${region}&sort_by=primary_release_date.asc&page=${page}`;

        const discoverRes = await fetch(discoverUrl);
        if (!discoverRes.ok) {
          console.error(`[get-release-calendar] Discover page ${page} failed: ${discoverRes.status}`);
          break;
        }

        const discoverData = await discoverRes.json();
        allMovies.push(...discoverData.results);

        if (page >= discoverData.total_pages) break;
      }

      // Build movie info map
      for (const m of allMovies) {
        movieMap.set(m.id, {
          title: m.title,
          poster_path: m.poster_path,
          backdrop_path: m.backdrop_path,
          genre_ids: m.genre_ids || [],
          vote_average: m.vote_average || 0,
        });
      }

      // Step 2: Fetch release dates for each movie and upsert into cache
      const BATCH_SIZE = 20;
      for (let i = 0; i < allMovies.length; i += BATCH_SIZE) {
        const batch = allMovies.slice(i, i + BATCH_SIZE);

        const releaseDatePromises = batch.map(async (movie) => {
          try {
            const url = `${TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${TMDB_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return { tmdb_id: movie.id, results: data.results };
          } catch (e) {
            console.error(`[get-release-calendar] Failed to fetch release dates for ${movie.id}:`, e);
            return null;
          }
        });

        const results = await Promise.all(releaseDatePromises);

        // Collect rows to upsert
        const rows: {
          tmdb_id: number;
          region: string;
          release_type: number;
          release_date: string;
          certification: string | null;
          note: string | null;
          fetched_at: string;
        }[] = [];

        for (const result of results) {
          if (!result) continue;
          const countryData = result.results.find(
            (r: { iso_3166_1: string }) => r.iso_3166_1 === region
          );
          if (!countryData) continue;

          for (const rd of countryData.release_dates) {
            const releaseDate = rd.release_date.split('T')[0];
            rows.push({
              tmdb_id: result.tmdb_id,
              region,
              release_type: rd.type,
              release_date: releaseDate,
              certification: rd.certification || null,
              note: rd.note || null,
              fetched_at: new Date().toISOString(),
            });
          }
        }

        if (rows.length > 0) {
          const { error: upsertError } = await supabase
            .from('release_date_cache')
            .upsert(rows, { onConflict: 'tmdb_id,region,release_type' });

          if (upsertError) {
            console.error('[get-release-calendar] Upsert error:', upsertError);
          }
        }

        // Rate limiting delay between batches
        if (i + BATCH_SIZE < allMovies.length) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    }

    // Step 3: Read from cache for this month
    const { data: releases, error: readError } = await supabase
      .from('release_date_cache')
      .select('tmdb_id, release_type, release_date, certification')
      .eq('region', region)
      .gte('release_date', startDate)
      .lte('release_date', endDate)
      .order('release_date', { ascending: true });

    if (readError) throw readError;

    // If we used cache and don't have movieMap yet, fetch movie info
    const tmdbIds = [...new Set((releases || []).map(r => r.tmdb_id))];

    if (movieMap.size === 0 && tmdbIds.length > 0) {
      // Try the movies cache table first
      const { data: cachedMovies } = await supabase
        .from('movies')
        .select('tmdb_id, title, poster_path, backdrop_path, genre_ids, vote_average')
        .in('tmdb_id', tmdbIds);

      if (cachedMovies) {
        for (const m of cachedMovies) {
          movieMap.set(m.tmdb_id, {
            title: m.title,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            genre_ids: m.genre_ids || [],
            vote_average: m.vote_average || 0,
          });
        }
      }

      // Fetch any missing movies from TMDB directly
      const missingIds = tmdbIds.filter(id => !movieMap.has(id));
      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += 20) {
          const batch = missingIds.slice(i, i + 20);
          const promises = batch.map(async (id) => {
            try {
              const url = `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`;
              const res = await fetch(url);
              if (!res.ok) return null;
              const data = await res.json();
              return {
                id: data.id as number,
                title: data.title as string,
                poster_path: data.poster_path as string | null,
                backdrop_path: data.backdrop_path as string | null,
                genre_ids: ((data.genres || []) as { id: number }[]).map((g) => g.id),
                vote_average: (data.vote_average || 0) as number,
              };
            } catch {
              return null;
            }
          });
          const movieResults = await Promise.all(promises);
          for (const m of movieResults) {
            if (m) {
              movieMap.set(m.id, {
                title: m.title,
                poster_path: m.poster_path,
                backdrop_path: m.backdrop_path,
                genre_ids: m.genre_ids,
                vote_average: m.vote_average,
              });
            }
          }
          if (i + 20 < missingIds.length) {
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }
      }
    }

    // Step 4: Group by date
    const dayMap = new Map<string, CalendarRelease[]>();

    for (const r of (releases || [])) {
      const movieInfo = movieMap.get(r.tmdb_id);
      if (!movieInfo) continue;

      const release: CalendarRelease = {
        tmdb_id: r.tmdb_id,
        title: movieInfo.title,
        poster_path: movieInfo.poster_path,
        backdrop_path: movieInfo.backdrop_path,
        release_type: r.release_type,
        release_type_label: RELEASE_TYPE_LABELS[r.release_type] || 'Unknown',
        genre_ids: movieInfo.genre_ids,
        vote_average: movieInfo.vote_average,
        release_date: r.release_date,
      };

      const existing = dayMap.get(r.release_date) || [];
      existing.push(release);
      dayMap.set(r.release_date, existing);
    }

    // Sort days and build response
    const sortedDates = [...dayMap.keys()].sort();
    const days: CalendarDay[] = sortedDates.map(date => ({
      date,
      releases: dayMap.get(date)!,
    }));

    const response: ReleaseCalendarResponse = {
      days,
      dates_with_releases: sortedDates,
      total_results: (releases || []).length,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[get-release-calendar]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
