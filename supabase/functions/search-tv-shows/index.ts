import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBTvShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
  popularity: number;
}

interface TMDBSearchResponse {
  page: number;
  results: TMDBTvShow[];
  total_pages: number;
  total_results: number;
}

interface SearchTvShowsRequest {
  query: string;
  page?: number;
}

interface SearchTvShowsResponse {
  shows: TMDBTvShow[];
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
    const rateLimited = await enforceIpRateLimit(clientIp, 'search_tv_shows', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { query, page = 1 }: SearchTvShowsRequest = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tmdbUrl = new URL('https://api.themoviedb.org/3/search/tv');
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('query', query.trim());
    tmdbUrl.searchParams.set('page', String(page));
    tmdbUrl.searchParams.set('include_adult', 'false');

    const tmdbResponse = await fetch(tmdbUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }

    const tmdbData: TMDBSearchResponse = await tmdbResponse.json();

    const response: SearchTvShowsResponse = {
      shows: tmdbData.results,
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
