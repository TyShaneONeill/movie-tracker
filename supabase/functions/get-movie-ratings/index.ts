import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface GetMovieRatingsRequest {
  tmdb_id: number;
}

interface ExternalRatingsResponse {
  ratings: {
    imdb: { rating: number; votes: number } | null;
    rottenTomatoes: { score: number } | null;
    metacritic: { score: number } | null;
  } | null;
  source: 'cache' | 'omdb' | 'unavailable';
}

interface OMDbRating {
  Source: string;
  Value: string;
}

interface OMDbResponse {
  Response: string;
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: OMDbRating[];
}

interface CachedMovie {
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  rotten_tomatoes_score: number | null;
  metacritic_score: number | null;
  external_ratings_fetched_at: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL_DAYS = 7;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if the cached ratings are still fresh (within TTL).
 */
function isCacheFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;
  const fetchedDate = new Date(fetchedAt);
  const now = new Date();
  const diffMs = now.getTime() - fetchedDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < CACHE_TTL_DAYS;
}

/**
 * Build the ratings response from cached DB columns.
 */
function buildRatingsFromCache(movie: CachedMovie): ExternalRatingsResponse['ratings'] {
  const hasAny =
    movie.imdb_rating !== null ||
    movie.rotten_tomatoes_score !== null ||
    movie.metacritic_score !== null;

  if (!hasAny) return null;

  return {
    imdb:
      movie.imdb_rating !== null
        ? { rating: movie.imdb_rating, votes: movie.imdb_votes ?? 0 }
        : null,
    rottenTomatoes:
      movie.rotten_tomatoes_score !== null
        ? { score: movie.rotten_tomatoes_score }
        : null,
    metacritic:
      movie.metacritic_score !== null
        ? { score: movie.metacritic_score }
        : null,
  };
}

/**
 * Parse OMDb response into normalized ratings.
 */
function parseOMDbRatings(omdb: OMDbResponse): {
  imdbRating: number | null;
  imdbVotes: number | null;
  rottenTomatoesScore: number | null;
  metacriticScore: number | null;
} {
  // Parse IMDb rating
  let imdbRating: number | null = null;
  if (omdb.imdbRating && omdb.imdbRating !== 'N/A') {
    const parsed = parseFloat(omdb.imdbRating);
    if (!isNaN(parsed)) imdbRating = parsed;
  }

  // Parse IMDb votes (remove commas, parse to int)
  let imdbVotes: number | null = null;
  if (omdb.imdbVotes && omdb.imdbVotes !== 'N/A') {
    const cleaned = omdb.imdbVotes.replace(/,/g, '');
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed)) imdbVotes = parsed;
  }

  // Parse Rotten Tomatoes from Ratings array
  let rottenTomatoesScore: number | null = null;
  const rtRating = omdb.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');
  if (rtRating && rtRating.Value !== 'N/A') {
    const match = rtRating.Value.match(/^(\d+)%$/);
    if (match) {
      rottenTomatoesScore = parseInt(match[1], 10);
    }
  }

  // Parse Metacritic from Ratings array (or fallback to Metascore)
  let metacriticScore: number | null = null;
  const mcRating = omdb.Ratings?.find((r) => r.Source === 'Metacritic');
  if (mcRating && mcRating.Value !== 'N/A') {
    const match = mcRating.Value.match(/^(\d+)\/100$/);
    if (match) {
      metacriticScore = parseInt(match[1], 10);
    }
  } else if (omdb.Metascore && omdb.Metascore !== 'N/A') {
    const parsed = parseInt(omdb.Metascore, 10);
    if (!isNaN(parsed)) metacriticScore = parsed;
  }

  return { imdbRating, imdbVotes, rottenTomatoesScore, metacriticScore };
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const OMDB_API_KEY = Deno.env.get('OMDB_API_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    if (!OMDB_API_KEY) {
      throw new Error('OMDB_API_KEY not configured');
    }

    // Parse request body
    const { tmdb_id }: GetMovieRatingsRequest = await req.json();

    if (!tmdb_id || typeof tmdb_id !== 'number' || tmdb_id <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid tmdb_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // IP-based rate limit: 100 requests per hour (no auth required for this endpoint)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_movie_ratings', 100, 3600, req);
    if (rateLimited) return rateLimited;

    // Create admin client for DB access
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Look up movie by tmdb_id
    const { data: movie, error: movieError } = await supabaseClient
      .from('movies')
      .select('imdb_id, imdb_rating, imdb_votes, rotten_tomatoes_score, metacritic_score, external_ratings_fetched_at')
      .eq('tmdb_id', tmdb_id)
      .maybeSingle();

    if (movieError) {
      console.error('[get-movie-ratings] DB lookup error:', movieError);
      throw new Error('Failed to look up movie');
    }

    // Step 2: If movie not in cache at all, return unavailable
    if (!movie) {
      const response: ExternalRatingsResponse = { ratings: null, source: 'unavailable' };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 3: If no imdb_id, we can't fetch from OMDb
    if (!movie.imdb_id) {
      const response: ExternalRatingsResponse = { ratings: null, source: 'unavailable' };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 4: Check if cached ratings are still fresh
    if (isCacheFresh(movie.external_ratings_fetched_at)) {
      const ratings = buildRatingsFromCache(movie as CachedMovie);
      const response: ExternalRatingsResponse = { ratings, source: 'cache' };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 5: Fetch from OMDb API
    const omdbUrl = `https://www.omdbapi.com/?i=${encodeURIComponent(movie.imdb_id)}&apikey=${OMDB_API_KEY}`;

    const omdbController = new AbortController();
    const omdbTimeoutId = setTimeout(() => omdbController.abort(), 10_000);

    let omdbResponse: Response;
    try {
      omdbResponse = await fetch(omdbUrl, { signal: omdbController.signal });
    } catch (error) {
      clearTimeout(omdbTimeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('[get-movie-ratings] OMDb API timed out after 10 seconds');
      } else {
        console.error('[get-movie-ratings] OMDb fetch error:', error);
      }

      // Return cached data if available, otherwise unavailable
      const ratings = buildRatingsFromCache(movie as CachedMovie);
      const response: ExternalRatingsResponse = {
        ratings,
        source: ratings ? 'cache' : 'unavailable',
      };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    clearTimeout(omdbTimeoutId);

    // Handle OMDb rate limit (402) or server errors
    if (!omdbResponse.ok) {
      console.error('[get-movie-ratings] OMDb API error:', omdbResponse.status, omdbResponse.statusText);

      // Return cached data if available
      const ratings = buildRatingsFromCache(movie as CachedMovie);
      const response: ExternalRatingsResponse = {
        ratings,
        source: ratings ? 'cache' : 'unavailable',
      };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const omdbData: OMDbResponse = await omdbResponse.json();

    // Handle OMDb returning Response: "False" (e.g., movie not found)
    if (omdbData.Response === 'False') {
      console.warn('[get-movie-ratings] OMDb returned error:', omdbData.Error);

      // Still update timestamp to avoid hammering OMDb for movies it doesn't have
      await supabaseClient
        .from('movies')
        .update({ external_ratings_fetched_at: new Date().toISOString() })
        .eq('tmdb_id', tmdb_id);

      const response: ExternalRatingsResponse = { ratings: null, source: 'unavailable' };
      return new Response(JSON.stringify(response), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Step 6: Parse ratings
    const parsed = parseOMDbRatings(omdbData);

    // Step 7: Update movies table with parsed ratings + timestamp
    const { error: updateError } = await supabaseClient
      .from('movies')
      .update({
        imdb_rating: parsed.imdbRating,
        imdb_votes: parsed.imdbVotes,
        rotten_tomatoes_score: parsed.rottenTomatoesScore,
        metacritic_score: parsed.metacriticScore,
        external_ratings_fetched_at: new Date().toISOString(),
      })
      .eq('tmdb_id', tmdb_id);

    if (updateError) {
      console.error('[get-movie-ratings] Failed to update cache:', updateError);
      // Don't fail the request, just return the parsed data
    }

    // Step 8: Build and return response
    const ratings: ExternalRatingsResponse['ratings'] = {
      imdb:
        parsed.imdbRating !== null
          ? { rating: parsed.imdbRating, votes: parsed.imdbVotes ?? 0 }
          : null,
      rottenTomatoes:
        parsed.rottenTomatoesScore !== null
          ? { score: parsed.rottenTomatoesScore }
          : null,
      metacritic:
        parsed.metacriticScore !== null
          ? { score: parsed.metacriticScore }
          : null,
    };

    const hasAny = ratings.imdb || ratings.rottenTomatoes || ratings.metacritic;

    const response: ExternalRatingsResponse = {
      ratings: hasAny ? ratings : null,
      source: 'omdb',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[get-movie-ratings] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
