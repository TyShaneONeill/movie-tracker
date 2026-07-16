import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

// Public TMDB proxy (verify_jwt=false), used by the TV Time import gateway
// (lib/tvtime-import/gateway.ts) to map a TVDB show id to its TMDB id. Wraps
// TMDB's GET /find/{external_id}?external_source=tvdb_id and returns the first
// tv_results entry, or null when TMDB has no mapping. Mirrors the
// search-movies / search-tv-shows functions verbatim (CORS, TMDB key handling,
// IP rate limit, generic error shape).
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
    const { externalId, source, type } = await req.json();
    // externalId must be a finite positive integer; source/type must equal the
    // only supported values. Anything else is a client bug, not a null result.
    if (typeof externalId !== 'number' || !Number.isInteger(externalId) || externalId <= 0) {
      return new Response(JSON.stringify({
        error: 'externalId must be a positive integer'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (source !== 'tvdb_id') {
      return new Response(JSON.stringify({
        error: "source must be 'tvdb_id'"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (type !== 'tv') {
      return new Response(JSON.stringify({
        error: "type must be 'tv'"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // IP-based rate limit for this public (verify_jwt=false) TMDB proxy.
    // Matches the search functions: 600 req / 60s per IP — generous headroom
    // for a chunked import while stopping a runaway scraper.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'find_by_external_id', 600, 60, req);
    if (rateLimited) return rateLimited;
    const tmdbUrl = new URL(`https://api.themoviedb.org/3/find/${externalId}`);
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('external_source', 'tvdb_id');
    const tmdbResponse = await fetch(tmdbUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }
    const tmdbData = await tmdbResponse.json();
    const match = Array.isArray(tmdbData.tv_results) ? tmdbData.tv_results[0] : undefined;
    const response = {
      tv: match ? { id: match.id, name: match.name } : null
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
