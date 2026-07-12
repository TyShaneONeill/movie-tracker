import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const fetchJson = async (url)=>{
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`TMDB error ${r.status}`);
      }
      return await r.json();
    };
    const [movieResult, tvResult] = await Promise.allSettled([
      fetchJson(movieUrl.toString()),
      fetchJson(tvUrl.toString())
    ]);
    if (movieResult.status === 'rejected' && tvResult.status === 'rejected') {
      throw new Error(`TMDB search failed (movies: ${movieResult.reason?.message}; tv: ${tvResult.reason?.message})`);
    }
    const movieData = movieResult.status === 'fulfilled' ? movieResult.value : null;
    const tvData = tvResult.status === 'fulfilled' ? tvResult.value : null;
    const errors = {};
    if (movieResult.status === 'rejected') {
      errors.movies = movieResult.reason?.message || 'movie search failed';
    }
    if (tvResult.status === 'rejected') {
      errors.tvShows = tvResult.reason?.message || 'tv search failed';
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
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
