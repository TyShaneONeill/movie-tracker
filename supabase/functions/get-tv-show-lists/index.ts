import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TvShowListType = 'trending' | 'airing_today' | 'on_the_air' | 'top_rated';

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

interface TMDBListResponse {
  page: number;
  results: TMDBTvShow[];
  total_pages: number;
  total_results: number;
}

interface GetTvShowListRequest {
  type: TvShowListType;
  page?: number;
}

interface TvShowListResponse {
  shows: TMDBTvShow[];
  page: number;
  totalPages: number;
  totalResults: number;
}

const VALID_TYPES: TvShowListType[] = ['trending', 'airing_today', 'on_the_air', 'top_rated'];

function getEndpointForType(type: TvShowListType): string {
  switch (type) {
    case 'trending':
      return 'https://api.themoviedb.org/3/trending/tv/week';
    case 'airing_today':
      return 'https://api.themoviedb.org/3/tv/airing_today';
    case 'on_the_air':
      return 'https://api.themoviedb.org/3/tv/on_the_air';
    case 'top_rated':
      return 'https://api.themoviedb.org/3/tv/top_rated';
    default:
      throw new Error(`Invalid list type: ${type}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_tv_show_lists', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { type, page = 1 }: GetTvShowListRequest = await req.json();

    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing type parameter. Must be: trending, airing_today, on_the_air, or top_rated' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoint = getEndpointForType(type);
    const tmdbUrl = new URL(endpoint);
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('page', String(page));
    tmdbUrl.searchParams.set('language', 'en-US');

    const tmdbResponse = await fetch(tmdbUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }

    const tmdbData: TMDBListResponse = await tmdbResponse.json();

    const response: TvShowListResponse = {
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
