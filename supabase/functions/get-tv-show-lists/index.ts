import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const VALID_TYPES = [
  'trending',
  'airing_today',
  'on_the_air',
  'top_rated'
];
function getEndpointForType(type) {
  switch(type){
    case 'trending':
      return 'https://api.themoviedb.org/3/trending/tv/week';
    case 'airing_today':
      return 'https://api.themoviedb.org/3/tv/airing_today';
    case 'on_the_air':
      return 'https://api.themoviedb.org/3/tv/on_the_air';
    case 'top_rated':
      return 'https://api.themoviedb.org/3/tv/top_rated';
    default:
      throw new Error(`Invalid list type: ${type}`);
  }
}
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
    const { type, page = 1 } = await req.json();
    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(JSON.stringify({
        error: 'Invalid or missing type parameter. Must be: trending, airing_today, on_the_air, or top_rated'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const endpoint = getEndpointForType(type);
    const tmdbUrl = new URL(endpoint);
    tmdbUrl.searchParams.set('api_key', TMDB_API_KEY);
    tmdbUrl.searchParams.set('page', String(page));
    tmdbUrl.searchParams.set('language', 'en-US');
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
