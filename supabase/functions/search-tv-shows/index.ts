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
    const { query, page = 1 } = await req.json();
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
    const rateLimited = await enforceIpRateLimit(clientIp, 'search_tv_shows', 600, 60, req);
    if (rateLimited) return rateLimited;
    const tmdbUrl = new URL('https://api.themoviedb.org/3/search/tv');
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('query', query.trim());
    tmdbUrl.searchParams.set('page', String(page));
    tmdbUrl.searchParams.set('include_adult', 'false');
    const tmdbResponse = await fetch(tmdbUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }
    const tmdbData = await tmdbResponse.json();
    const response = {
      shows: tmdbData.results,
      page: tmdbData.page,
      totalPages: tmdbData.total_pages,
      totalResults: tmdbData.total_results
    };
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
