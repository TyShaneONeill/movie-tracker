import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const { genreId, page = 1, sortBy = 'popularity.desc', with_companies } = await req.json();
    // Additive: a browse can be scoped by genre (existing callers) and/or by
    // studio (with_companies, e.g. the Search v2 A24 shelf). At least one is
    // required. The genre-only request path is byte-identical to before —
    // with_companies is simply absent, so the URL is unchanged.
    const hasGenre = typeof genreId === 'number' && genreId > 0;
    const hasCompanies = with_companies !== undefined && with_companies !== null && String(with_companies).trim().length > 0;
    if (!hasGenre && !hasCompanies) {
      return new Response(JSON.stringify({
        error: 'Valid genreId parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const discoverUrl = new URL('https://api.themoviedb.org/3/discover/movie');
    discoverUrl.searchParams.set('api_key', TMDB_API_KEY);
    if (hasGenre) {
      discoverUrl.searchParams.set('with_genres', String(genreId));
    }
    if (hasCompanies) {
      discoverUrl.searchParams.set('with_companies', String(with_companies).trim());
    }
    discoverUrl.searchParams.set('sort_by', sortBy);
    discoverUrl.searchParams.set('page', String(page));
    discoverUrl.searchParams.set('include_adult', 'false');
    discoverUrl.searchParams.set('vote_count.gte', '50');
    const tmdbResponse = await fetch(discoverUrl.toString());
    if (!tmdbResponse.ok) {
      throw new Error(`TMDB API error: ${tmdbResponse.status}`);
    }
    const tmdbData = await tmdbResponse.json();
    const response = {
      movies: tmdbData.results,
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
