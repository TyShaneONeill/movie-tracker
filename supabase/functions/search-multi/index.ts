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
    const [movieResponse, tvResponse] = await Promise.all([
      fetch(movieUrl.toString()),
      fetch(tvUrl.toString())
    ]);
    if (!movieResponse.ok) {
      throw new Error(`TMDB movie search error: ${movieResponse.status}`);
    }
    if (!tvResponse.ok) {
      throw new Error(`TMDB tv search error: ${tvResponse.status}`);
    }
    const [movieData, tvData] = await Promise.all([
      movieResponse.json(),
      tvResponse.json()
    ]);
    const response = {
      movies: movieData.results,
      tvShows: tvData.results,
      movieTotal: movieData.total_results,
      tvTotal: tvData.total_results,
      page: movieData.page
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
