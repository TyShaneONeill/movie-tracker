import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

interface TMDBDiscoverResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

interface DiscoverMoviesRequest {
  genreId: number;
  page?: number;
  sortBy?: string;
}

interface DiscoverMoviesResponse {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'discover_movies', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { genreId, page = 1, sortBy = 'popularity.desc' }: DiscoverMoviesRequest = await req.json();

    if (!genreId || typeof genreId !== 'number' || genreId <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid genreId parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const discoverUrl = new URL('https://api.themoviedb.org/3/discover/movie');
    discoverUrl.searchParams.set('api_key', TMDB_API_KEY);
    discoverUrl.searchParams.set('with_genres', String(genreId));
    discoverUrl.searchParams.set('sort_by', sortBy);
    discoverUrl.searchParams.set('page', String(page));
    discoverUrl.searchParams.set('include_adult', 'false');
    discoverUrl.searchParams.set('vote_count.gte', '50');

    const tmdbResponse = await fetch(discoverUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }

    const tmdbData: TMDBDiscoverResponse = await tmdbResponse.json();

    const response: DiscoverMoviesResponse = {
      movies: tmdbData.results,
      page: tmdbData.page,
      totalPages: tmdbData.total_pages,
      totalResults: tmdbData.total_results,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
