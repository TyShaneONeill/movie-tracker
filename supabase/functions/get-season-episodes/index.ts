import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  guest_stars: { id: number; name: string; character: string; profile_path: string | null }[];
}

interface TMDBSeasonResponse {
  _id: string;
  air_date: string | null;
  episodes: TMDBEpisode[];
  name: string;
  overview: string;
  id: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
}

interface GetSeasonEpisodesRequest {
  showId: number;
  seasonNumber: number;
}

interface SeasonDetailResponse {
  episodes: TMDBEpisode[];
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_season_episodes', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { showId, seasonNumber }: GetSeasonEpisodesRequest = await req.json();

    if (!showId || typeof showId !== 'number' || showId <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid showId parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (seasonNumber === undefined || typeof seasonNumber !== 'number' || seasonNumber < 0) {
      return new Response(
        JSON.stringify({ error: 'Valid seasonNumber parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}`);
    seasonUrl.searchParams.set('api_key', TMDB_API_KEY);

    const seasonResponse = await fetch(seasonUrl.toString());

    if (!seasonResponse.ok) {
      if (seasonResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Season not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TMDB API error: ${seasonResponse.status}`);
    }

    const seasonData: TMDBSeasonResponse = await seasonResponse.json();

    const episodes: TMDBEpisode[] = (seasonData.episodes || []).map(ep => ({
      id: ep.id,
      episode_number: ep.episode_number,
      season_number: ep.season_number,
      name: ep.name ?? '',
      overview: ep.overview ?? '',
      air_date: ep.air_date ?? null,
      runtime: ep.runtime ?? null,
      still_path: ep.still_path ?? null,
      vote_average: ep.vote_average ?? 0,
      vote_count: ep.vote_count ?? 0,
      guest_stars: (ep.guest_stars || []).map(gs => ({
        id: gs.id,
        name: gs.name,
        character: gs.character ?? '',
        profile_path: gs.profile_path ?? null,
      })),
    }));

    const response: SeasonDetailResponse = {
      episodes,
      seasonNumber: seasonData.season_number,
      name: seasonData.name ?? '',
      overview: seasonData.overview ?? '',
      posterPath: seasonData.poster_path ?? null,
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
