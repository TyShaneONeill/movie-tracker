import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Consolidates the Search v2 title fan-out (search-movies title-mode +
// search-tv-shows) into ONE call. Runs the two dedicated TMDB endpoints in
// parallel rather than /search/multi: /search/multi returns a single
// heterogeneous list with a media_type discriminator and one combined
// total_results, so it cannot cleanly reproduce the per-type arrays and
// per-type totals the client already consumes. Two parallel requests keep the
// movies/tvShows shapes byte-identical to the individual fns.
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
    // This is the LIVE per-keystroke search backend, so the cap must never
    // throttle a real user, and mobile clients share carrier-grade NAT IPs.
    // 600 req / 60s stops a runaway scraper while leaving huge headroom for
    // legitimate typing. (One invocation = one check even though it fans out to
    // two TMDB endpoints, so the effective TMDB budget is 2x this.)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'search_multi', 600, 60, req);
    if (rateLimited) return rateLimited;
    const trimmed = query.trim();
    const movieUrl = new URL('https://api.themoviedb.org/3/search/movie');
    movieUrl.searchParams.set('api_key', TMDB_API_KEY);
    movieUrl.searchParams.set('query', trimmed);
    movieUrl.searchParams.set('page', String(page));
    movieUrl.searchParams.set('include_adult', 'false');
    const tvUrl = new URL('https://api.themoviedb.org/3/search/tv');
    tvUrl.searchParams.set('api_key', TMDB_API_KEY);
    tvUrl.searchParams.set('query', trimmed);
    tvUrl.searchParams.set('page', String(page));
    tvUrl.searchParams.set('include_adult', 'false');
    // Partial-failure resilient: a single-endpoint TMDB outage must not blank
    // the whole result set. Settle both independently; each side that succeeds
    // is returned, each that fails contributes empty results + total 0 and is
    // named in `errors` so the client can distinguish "no matches" from
    // "search unavailable". Only when BOTH fail do we surface a 500.
    // fetch() network-level TypeErrors embed the full request URL, which carries
    // ?api_key=… — so a rejection reason must NEVER be surfaced verbatim. Each
    // failure is reduced here to a sanitized token: an HTTP status ("status 502")
    // or the fixed string "unreachable" for a network error. reason.message can
    // therefore only ever be one of those tokens downstream — no URL, no key.
    const fetchJson = async (url, side)=>{
      let r;
      try {
        r = await fetch(url);
      } catch (e) {
        console.error(`search-multi ${side} network error:`, e);
        throw new Error('unreachable');
      }
      if (!r.ok) {
        throw new Error(`status ${r.status}`);
      }
      return await r.json();
    };
    // Build a client-safe description from a rejection reason. Only ever emits a
    // fixed string or a status code captured by regex — never interpolates the
    // raw message — so it cannot carry the api_key even if the token changes.
    const describeFailure = (reason, side)=>{
      const msg = typeof reason?.message === 'string' ? reason.message : '';
      const statusMatch = msg.match(/^status (\d+)$/);
      return statusMatch ? `${side} search failed (TMDB ${statusMatch[1]})` : `${side} search unavailable`;
    };
    const [movieResult, tvResult] = await Promise.allSettled([
      fetchJson(movieUrl.toString(), 'movie'),
      fetchJson(tvUrl.toString(), 'tv')
    ]);
    if (movieResult.status === 'rejected' && tvResult.status === 'rejected') {
      throw new Error(`TMDB search failed (movies: ${describeFailure(movieResult.reason, 'movie')}; tv: ${describeFailure(tvResult.reason, 'tv')})`);
    }
    const movieData = movieResult.status === 'fulfilled' ? movieResult.value : null;
    const tvData = tvResult.status === 'fulfilled' ? tvResult.value : null;
    const errors = {};
    if (movieResult.status === 'rejected') {
      errors.movies = describeFailure(movieResult.reason, 'movie');
    }
    if (tvResult.status === 'rejected') {
      errors.tvShows = describeFailure(tvResult.reason, 'tv');
    }
    const response = {
      movies: movieData?.results ?? [],
      tvShows: tvData?.results ?? [],
      movieTotal: movieData?.total_results ?? 0,
      tvTotal: tvData?.total_results ?? 0,
      page: movieData?.page ?? tvData?.page ?? 1,
      ...(Object.keys(errors).length ? { errors } : {})
    };
    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    // Never echo error.message: a fetch network TypeError embeds the request URL
    // (?api_key=…). Log the real error server-side (private) and return generic.
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
