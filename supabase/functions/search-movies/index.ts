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

interface TMDBSearchResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
}

interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPerson[];
  total_pages: number;
  total_results: number;
}

interface TMDBMovieCredits {
  cast: Array<TMDBMovie & { character: string }>;
  crew: Array<TMDBMovie & { job: string }>;
}

interface SearchMoviesRequest {
  query: string;
  page?: number;
  searchType?: 'title' | 'actor';
}

interface SearchMoviesResponse {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  actor?: { id: number; name: string; profile_path: string | null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'search_movies', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { query, page = 1, searchType = 'title' }: SearchMoviesRequest = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let response: SearchMoviesResponse;

    if (searchType === 'actor') {
      // Step 1: Search for the person
      const personSearchUrl = new URL('https://api.themoviedb.org/3/search/person');
      personSearchUrl.searchParams.set('api_key', TMDB_API_KEY);
      personSearchUrl.searchParams.set('query', query.trim());

      const personResponse = await fetch(personSearchUrl.toString());
      if (!personResponse.ok) {
        throw new Error(`TMDB person search error: ${personResponse.status}`);
      }

      const personData: TMDBPersonSearchResponse = await personResponse.json();

      if (personData.results.length === 0) {
        response = { movies: [], page: 1, totalPages: 0, totalResults: 0 };
      } else {
        // Get the first (most relevant) person
        const person = personData.results[0];

        // Step 2: Get their movie credits
        const creditsUrl = new URL(`https://api.themoviedb.org/3/person/${person.id}/movie_credits`);
        creditsUrl.searchParams.set('api_key', TMDB_API_KEY);

        const creditsResponse = await fetch(creditsUrl.toString());
        if (!creditsResponse.ok) {
          throw new Error(`TMDB credits error: ${creditsResponse.status}`);
        }

        const credits: TMDBMovieCredits = await creditsResponse.json();

        // Combine cast appearances, sort by popularity/vote_count
        const allMovies = credits.cast
          .filter((m) => m.title && m.id)
          .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

        // Paginate manually (20 per page like TMDB)
        const pageSize = 20;
        const startIndex = (page - 1) * pageSize;
        const paginatedMovies = allMovies.slice(startIndex, startIndex + pageSize);

        response = {
          movies: paginatedMovies,
          page,
          totalPages: Math.ceil(allMovies.length / pageSize),
          totalResults: allMovies.length,
          actor: {
            id: person.id,
            name: person.name,
            profile_path: person.profile_path,
          },
        };
      }
    } else {
      // Title search (original logic)
      const tmdbUrl = new URL('https://api.themoviedb.org/3/search/movie');
      tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
      tmdbUrl.searchParams.set('query', query.trim());
      tmdbUrl.searchParams.set('page', String(page));
      tmdbUrl.searchParams.set('include_adult', 'false');

      const tmdbResponse = await fetch(tmdbUrl.toString());
      if (!tmdbResponse.ok) {
        throw new Error(`TMDB API error: ${tmdbResponse.status}`);
      }

      const tmdbData: TMDBSearchResponse = await tmdbResponse.json();

      response = {
        movies: tmdbData.results,
        page: tmdbData.page,
        totalPages: tmdbData.total_pages,
        totalResults: tmdbData.total_results,
      };
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
