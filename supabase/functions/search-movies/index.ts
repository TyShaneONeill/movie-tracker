import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }
    const { query, page = 1, searchType = 'title' } = await req.json();
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'Query parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // IP-based rate limit for this public (verify_jwt=false) TMDB proxy.
    // Generous cap: per-keystroke search must never be throttled for a real
    // user, and mobile clients share carrier-grade NAT IPs. 600 req / 60s stops
    // a runaway scraper while leaving huge headroom for legitimate typing.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'search_movies', 600, 60, req);
    if (rateLimited) return rateLimited;
    let response;
    if (searchType === 'actor') {
      // Step 1: Search for the person
      const personSearchUrl = new URL('https://api.themoviedb.org/3/search/person');
      personSearchUrl.searchParams.set('api_key', TMDB_API_KEY);
      personSearchUrl.searchParams.set('query', query.trim());
      const personResponse = await fetch(personSearchUrl.toString());
      if (!personResponse.ok) {
        throw new Error(`TMDB person search error: ${personResponse.status}`);
      }
      const personData = await personResponse.json();
      if (personData.results.length === 0) {
        response = {
          movies: [],
          page: 1,
          totalPages: 0,
          totalResults: 0
        };
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
        const credits = await creditsResponse.json();
        // Combine cast appearances, sort by popularity/vote_count
        const allMovies = credits.cast.filter((m)=>m.title && m.id).sort((a, b)=>(b.vote_count || 0) - (a.vote_count || 0));
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
            profile_path: person.profile_path
          }
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
      const tmdbData = await tmdbResponse.json();
      response = {
        movies: tmdbData.results,
        page: tmdbData.page,
        totalPages: tmdbData.total_pages,
        totalResults: tmdbData.total_results
      };
    }
    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    // Never echo error.message: Deno fetch network TypeErrors embed the full
    // request URL, which carries ?api_key=… and would leak the TMDB key. Log
    // the real error server-side (function logs are private) and return generic.
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
