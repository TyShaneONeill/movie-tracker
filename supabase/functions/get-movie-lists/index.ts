import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MovieListType = 'trending' | 'now_playing' | 'upcoming';

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

interface TMDBListResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
  dates?: { minimum: string; maximum: string };
}

interface GetMovieListRequest {
  type: MovieListType;
  page?: number;
}

interface MovieListResponse {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  dates?: { minimum: string; maximum: string };
}

function getEndpointForType(type: MovieListType): string {
  switch (type) {
    case 'trending':
      return 'https://api.themoviedb.org/3/trending/movie/day';
    case 'now_playing':
      return 'https://api.themoviedb.org/3/movie/now_playing';
    case 'upcoming':
      return 'https://api.themoviedb.org/3/movie/upcoming';
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
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_movie_lists', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { type, page = 1 }: GetMovieListRequest = await req.json();

    if (!type || !['trending', 'now_playing', 'upcoming'].includes(type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing type parameter. Must be: trending, now_playing, or upcoming' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoint = getEndpointForType(type);
    const tmdbUrl = new URL(endpoint);
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('page', String(page));
    tmdbUrl.searchParams.set('language', 'en-US');
    tmdbUrl.searchParams.set('region', 'US');

    const tmdbResponse = await fetch(tmdbUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }

    const tmdbData: TMDBListResponse = await tmdbResponse.json();

    const response: MovieListResponse = {
      movies: tmdbData.results,
      page: tmdbData.page,
      totalPages: tmdbData.total_pages,
      totalResults: tmdbData.total_results,
    };

    // Include dates for now_playing and upcoming
    if (tmdbData.dates) {
      response.dates = tmdbData.dates;
    }

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
