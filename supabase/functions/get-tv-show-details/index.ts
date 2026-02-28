import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TMDBCreditsResponse {
  id: number;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

interface TMDBVideo {
  id: string;
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  published_at: string;
  iso_639_1: string | null;
}

interface TMDBVideosResponse {
  id: number;
  results: TMDBVideo[];
}

interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

interface TMDBWatchProvidersCountry {
  flatrate?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
  buy?: TMDBWatchProvider[];
  link?: string;
}

interface TMDBWatchProvidersResponse {
  id: number;
  results: Record<string, TMDBWatchProvidersCountry>;
}

interface TMDBSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  vote_average: number;
}

interface TMDBRecommendation {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  overview: string;
  genre_ids: number[];
}

interface TMDBTvShowDetail {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  genres: { id: number; name: string }[];
  tagline: string | null;
  status: string;
  type: string;
  in_production: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  networks: { id: number; name: string; logo_path: string | null }[];
  created_by: { id: number; name: string; profile_path: string | null }[];
  seasons: TMDBSeason[];
  original_language: string;
  origin_country: string[];
}

interface GetTvShowDetailsRequest {
  showId: number;
}

interface TvShowDetailResponse {
  show: TMDBTvShowDetail;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
  trailer: TMDBVideo | null;
  watchProviders: Record<string, TMDBWatchProvidersCountry>;
  seasons: TMDBSeason[];
  recommendations: TMDBRecommendation[];
}

const KEY_CREW_JOBS = [
  'Director',
  'Writer',
  'Screenplay',
  'Story',
  'Original Music Composer',
  'Director of Photography',
  'Producer',
  'Executive Producer',
  'Creator',
  'Showrunner',
];

function selectBestTrailer(
  videos: TMDBVideo[],
  originalLanguage: string | null
): TMDBVideo | null {
  const youtube = videos.filter(v => v.site === 'YouTube');

  const sortByQuality = (a: TMDBVideo, b: TMDBVideo) => {
    if (a.official !== b.official) return a.official ? -1 : 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  };

  for (const type of ['Trailer', 'Teaser']) {
    const group = youtube.filter(v => v.type === type);
    if (group.length === 0) continue;

    group.sort(sortByQuality);

    const english = group.find(v => v.iso_639_1 === 'en');
    if (english) return english;

    if (originalLanguage && originalLanguage !== 'en') {
      const orig = group.find(v => v.iso_639_1 === originalLanguage);
      if (orig) return orig;
    }

    return group[0];
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_tv_show_details', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { showId }: GetTvShowDetailsRequest = await req.json();

    if (!showId || typeof showId !== 'number' || showId <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid showId parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Fetch show details first (need original_language for videos call)
    const showUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}`);
    showUrl.searchParams.set('api_key', TMDB_API_KEY);

    const showResponse = await fetch(showUrl.toString());

    if (!showResponse.ok) {
      if (showResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'TV show not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TMDB TV API error: ${showResponse.status}`);
    }

    const showData = await showResponse.json();
    const originalLanguage: string | null = showData.original_language ?? null;

    // Step 2: Fetch credits + videos + watch providers + recommendations in parallel
    const creditsUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/credits`);
    creditsUrl.searchParams.set('api_key', TMDB_API_KEY);

    const videosUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/videos`);
    videosUrl.searchParams.set('api_key', TMDB_API_KEY);
    const videoLangs = originalLanguage && originalLanguage !== 'en'
      ? `en,${originalLanguage},null`
      : 'en,null';
    videosUrl.searchParams.set('include_video_language', videoLangs);

    const watchProvidersUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/watch/providers`);
    watchProvidersUrl.searchParams.set('api_key', TMDB_API_KEY);

    const recommendationsUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/recommendations`);
    recommendationsUrl.searchParams.set('api_key', TMDB_API_KEY);
    recommendationsUrl.searchParams.set('page', '1');

    const [creditsResponse, videosResponse, watchProvidersResponse, recommendationsResponse] = await Promise.all([
      fetch(creditsUrl.toString()),
      fetch(videosUrl.toString()),
      fetch(watchProvidersUrl.toString()),
      fetch(recommendationsUrl.toString()),
    ]);

    if (!creditsResponse.ok) {
      throw new Error(`TMDB credits API error: ${creditsResponse.status}`);
    }

    const creditsData: TMDBCreditsResponse = await creditsResponse.json();

    const seasons: TMDBSeason[] = (showData.seasons || []).map((s: any) => ({
      id: s.id,
      season_number: s.season_number,
      name: s.name ?? '',
      overview: s.overview ?? '',
      poster_path: s.poster_path ?? null,
      air_date: s.air_date ?? null,
      episode_count: s.episode_count ?? 0,
      vote_average: s.vote_average ?? 0,
    }));

    const show: TMDBTvShowDetail = {
      id: showData.id,
      name: showData.name,
      overview: showData.overview ?? '',
      poster_path: showData.poster_path,
      backdrop_path: showData.backdrop_path,
      first_air_date: showData.first_air_date ?? '',
      last_air_date: showData.last_air_date ?? null,
      vote_average: showData.vote_average ?? 0,
      vote_count: showData.vote_count ?? 0,
      genre_ids: showData.genres?.map((g: { id: number }) => g.id) ?? [],
      genres: showData.genres ?? [],
      tagline: showData.tagline ?? null,
      status: showData.status ?? '',
      type: showData.type ?? '',
      in_production: showData.in_production ?? false,
      number_of_seasons: showData.number_of_seasons ?? 0,
      number_of_episodes: showData.number_of_episodes ?? 0,
      episode_run_time: showData.episode_run_time ?? [],
      networks: (showData.networks || []).map((n: any) => ({
        id: n.id,
        name: n.name,
        logo_path: n.logo_path ?? null,
      })),
      created_by: (showData.created_by || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        profile_path: c.profile_path ?? null,
      })),
      seasons,
      original_language: showData.original_language ?? '',
      origin_country: showData.origin_country ?? [],
    };

    const cast: TMDBCastMember[] = creditsData.cast
      .slice(0, 20)
      .map(member => ({
        id: member.id,
        name: member.name,
        character: member.character,
        profile_path: member.profile_path,
        order: member.order,
      }));

    const crew: TMDBCrewMember[] = creditsData.crew
      .filter(member => KEY_CREW_JOBS.includes(member.job))
      .map(member => ({
        id: member.id,
        name: member.name,
        job: member.job,
        department: member.department,
        profile_path: member.profile_path ?? null,
      }));

    let trailer: TMDBVideo | null = null;
    if (videosResponse.ok) {
      const videosData: TMDBVideosResponse = await videosResponse.json();
      trailer = selectBestTrailer(videosData.results, originalLanguage);
    }

    let watchProviders: Record<string, TMDBWatchProvidersCountry> = {};
    if (watchProvidersResponse.ok) {
      const watchData: TMDBWatchProvidersResponse = await watchProvidersResponse.json();
      watchProviders = watchData.results ?? {};
    }

    // Process recommendations (top 10)
    let recommendations: TMDBRecommendation[] = [];
    if (recommendationsResponse.ok) {
      const recsData = await recommendationsResponse.json();
      recommendations = (recsData.results || []).slice(0, 10).map((r: any) => ({
        id: r.id,
        name: r.name ?? r.title ?? '',
        poster_path: r.poster_path ?? null,
        backdrop_path: r.backdrop_path ?? null,
        first_air_date: r.first_air_date ?? '',
        vote_average: r.vote_average ?? 0,
        overview: r.overview ?? '',
        genre_ids: r.genre_ids ?? [],
      }));
    }

    const response: TvShowDetailResponse = {
      show,
      cast,
      crew,
      trailer,
      watchProviders,
      seasons,
      recommendations,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
