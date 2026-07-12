import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Key crew jobs to include in the response
const KEY_CREW_JOBS = [
  'Director',
  'Writer',
  'Screenplay',
  'Story',
  'Original Music Composer',
  'Director of Photography',
  'Producer'
];
/**
 * Select the best trailer from a list of TMDB videos.
 */ function selectBestTrailer(videos, originalLanguage) {
  const youtube = videos.filter((v)=>v.site === 'YouTube');
  const sortByQuality = (a, b)=>{
    if (a.official !== b.official) return a.official ? -1 : 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  };
  for (const type of [
    'Trailer',
    'Teaser'
  ]){
    const group = youtube.filter((v)=>v.type === type);
    if (group.length === 0) continue;
    group.sort(sortByQuality);
    const english = group.find((v)=>v.iso_639_1 === 'en');
    if (english) return english;
    if (originalLanguage && originalLanguage !== 'en') {
      const orig = group.find((v)=>v.iso_639_1 === originalLanguage);
      if (orig) return orig;
    }
    return group[0];
  }
  return null;
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
    const { movieId } = await req.json();
    if (!movieId || typeof movieId !== 'number' || movieId <= 0) {
      return new Response(JSON.stringify({
        error: 'Valid movieId parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Step 1: Fetch movie details first (need original_language for videos call)
    const movieUrl = new URL(`https://api.themoviedb.org/3/movie/${movieId}`);
    movieUrl.searchParams.set('api_key', TMDB_API_KEY);
    const movieResponse = await fetch(movieUrl.toString());
    if (!movieResponse.ok) {
      if (movieResponse.status === 404) {
        return new Response(JSON.stringify({
          error: 'Movie not found'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      throw new Error(`TMDB movie API error: ${movieResponse.status}`);
    }
    const movieData = await movieResponse.json();
    const originalLanguage = movieData.original_language ?? null;
    // Step 2: Fetch credits + videos + watch providers in parallel
    const creditsUrl = new URL(`https://api.themoviedb.org/3/movie/${movieId}/credits`);
    creditsUrl.searchParams.set('api_key', TMDB_API_KEY);
    const videosUrl = new URL(`https://api.themoviedb.org/3/movie/${movieId}/videos`);
    videosUrl.searchParams.set('api_key', TMDB_API_KEY);
    const videoLangs = originalLanguage && originalLanguage !== 'en' ? `en,${originalLanguage},null` : 'en,null';
    videosUrl.searchParams.set('include_video_language', videoLangs);
    const watchProvidersUrl = new URL(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers`);
    watchProvidersUrl.searchParams.set('api_key', TMDB_API_KEY);
    const [creditsResponse, videosResponse, watchProvidersResponse] = await Promise.all([
      fetch(creditsUrl.toString()),
      fetch(videosUrl.toString()),
      fetch(watchProvidersUrl.toString())
    ]);
    if (!creditsResponse.ok) {
      throw new Error(`TMDB credits API error: ${creditsResponse.status}`);
    }
    const creditsData = await creditsResponse.json();
    const movie = {
      id: movieData.id,
      title: movieData.title,
      overview: movieData.overview,
      poster_path: movieData.poster_path,
      backdrop_path: movieData.backdrop_path,
      release_date: movieData.release_date,
      vote_average: movieData.vote_average,
      vote_count: movieData.vote_count,
      genre_ids: movieData.genres?.map((g)=>g.id) ?? [],
      runtime: movieData.runtime,
      genres: movieData.genres ?? [],
      tagline: movieData.tagline
    };
    // Get top cast members (limit to 20)
    const cast = creditsData.cast.slice(0, 20).map((member)=>({
        id: member.id,
        name: member.name,
        character: member.character,
        profile_path: member.profile_path,
        order: member.order
      }));
    // Get key crew members (directors, writers, composers, etc.)
    const crew = creditsData.crew.filter((member)=>KEY_CREW_JOBS.includes(member.job)).map((member)=>({
        id: member.id,
        name: member.name,
        job: member.job,
        department: member.department,
        profile_path: member.profile_path ?? null
      }));
    // Select the best trailer from videos
    let trailer = null;
    if (videosResponse.ok) {
      const videosData = await videosResponse.json();
      trailer = selectBestTrailer(videosData.results, originalLanguage);
    }
    // Get watch providers
    let watchProviders = {};
    if (watchProvidersResponse.ok) {
      const watchData = await watchProvidersResponse.json();
      watchProviders = watchData.results ?? {};
    }
    const response = {
      movie,
      cast,
      crew,
      trailer,
      watchProviders
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
