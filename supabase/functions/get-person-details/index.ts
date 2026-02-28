import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  gender: number;
  also_known_as: string[];
  homepage: string | null;
  imdb_id: string | null;
}

interface TMDBPersonMovieCredit {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  overview: string;
  popularity: number;
  character: string;
  credit_id: string;
  order: number;
}

interface TMDBPersonCrewCredit {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  overview: string;
  popularity: number;
  credit_id: string;
  department: string;
  job: string;
}

interface TMDBPersonTvCredit {
  id: number;
  name: string;
  original_name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  overview: string;
  popularity: number;
  character: string;
  credit_id: string;
  episode_count: number;
}

interface TMDBMovieCreditsResponse {
  cast: TMDBPersonMovieCredit[];
  crew: TMDBPersonCrewCredit[];
}

interface TMDBTvCreditsResponse {
  cast: TMDBPersonTvCredit[];
  crew: TMDBPersonTvCredit[];
}

interface GetPersonDetailsRequest {
  personId: number;
}

interface PersonDetailResponse {
  person: TMDBPerson;
  movieCredits: TMDBPersonMovieCredit[];
  crewCredits: TMDBPersonCrewCredit[];
  tvCredits: TMDBPersonTvCredit[];
  tvCrewCredits: TMDBPersonTvCredit[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting: 120 requests per hour
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_person_details', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { personId }: GetPersonDetailsRequest = await req.json();

    if (!personId || typeof personId !== 'number' || personId <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid personId parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch person details + movie credits + TV credits in a single call
    const personUrl = new URL(`https://api.themoviedb.org/3/person/${personId}`);
    personUrl.searchParams.set('api_key', TMDB_API_KEY);
    personUrl.searchParams.set('append_to_response', 'movie_credits,tv_credits');

    const personResponse = await fetch(personUrl.toString());

    if (!personResponse.ok) {
      if (personResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Person not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TMDB person API error: ${personResponse.status}`);
    }

    const personData = await personResponse.json();
    const movieCreditsData: TMDBMovieCreditsResponse = personData.movie_credits ?? { cast: [], crew: [] };
    const tvCreditsData: TMDBTvCreditsResponse = personData.tv_credits ?? { cast: [], crew: [] };

    const person: TMDBPerson = {
      id: personData.id,
      name: personData.name,
      biography: personData.biography ?? '',
      birthday: personData.birthday ?? null,
      deathday: personData.deathday ?? null,
      place_of_birth: personData.place_of_birth ?? null,
      profile_path: personData.profile_path ?? null,
      known_for_department: personData.known_for_department ?? 'Acting',
      popularity: personData.popularity ?? 0,
      gender: personData.gender ?? 0,
      also_known_as: personData.also_known_as ?? [],
      homepage: personData.homepage ?? null,
      imdb_id: personData.imdb_id ?? null,
    };

    // Map movie cast credits
    const movieCredits: TMDBPersonMovieCredit[] = movieCreditsData.cast
      .filter((c: TMDBPersonMovieCredit) => c.title && c.release_date)
      .sort((a: TMDBPersonMovieCredit, b: TMDBPersonMovieCredit) =>
        new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
      )
      .map((c: TMDBPersonMovieCredit) => ({
        id: c.id,
        title: c.title,
        original_title: c.original_title,
        poster_path: c.poster_path,
        backdrop_path: c.backdrop_path,
        release_date: c.release_date,
        vote_average: c.vote_average,
        vote_count: c.vote_count,
        genre_ids: c.genre_ids ?? [],
        overview: c.overview ?? '',
        popularity: c.popularity ?? 0,
        character: c.character ?? '',
        credit_id: c.credit_id,
        order: c.order ?? 0,
      }));

    // Map movie crew credits
    const crewCredits: TMDBPersonCrewCredit[] = movieCreditsData.crew
      .filter((c: TMDBPersonCrewCredit) => c.title && c.release_date)
      .sort((a: TMDBPersonCrewCredit, b: TMDBPersonCrewCredit) =>
        new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
      )
      .map((c: TMDBPersonCrewCredit) => ({
        id: c.id,
        title: c.title,
        original_title: c.original_title,
        poster_path: c.poster_path,
        backdrop_path: c.backdrop_path,
        release_date: c.release_date,
        vote_average: c.vote_average,
        vote_count: c.vote_count,
        genre_ids: c.genre_ids ?? [],
        overview: c.overview ?? '',
        popularity: c.popularity ?? 0,
        credit_id: c.credit_id,
        department: c.department ?? '',
        job: c.job ?? '',
      }));

    // Map TV cast credits
    const tvCredits: TMDBPersonTvCredit[] = tvCreditsData.cast
      .filter((c: TMDBPersonTvCredit) => c.name && c.first_air_date)
      .sort((a: TMDBPersonTvCredit, b: TMDBPersonTvCredit) =>
        new Date(b.first_air_date).getTime() - new Date(a.first_air_date).getTime()
      )
      .map((c: TMDBPersonTvCredit) => ({
        id: c.id,
        name: c.name,
        original_name: c.original_name ?? c.name,
        poster_path: c.poster_path,
        backdrop_path: c.backdrop_path,
        first_air_date: c.first_air_date,
        vote_average: c.vote_average,
        vote_count: c.vote_count,
        genre_ids: c.genre_ids ?? [],
        overview: c.overview ?? '',
        popularity: c.popularity ?? 0,
        character: c.character ?? '',
        credit_id: c.credit_id,
        episode_count: c.episode_count ?? 0,
      }));

    // Map TV crew credits
    const tvCrewCredits: TMDBPersonTvCredit[] = tvCreditsData.crew
      .filter((c: any) => c.name && c.first_air_date)
      .sort((a: any, b: any) =>
        new Date(b.first_air_date).getTime() - new Date(a.first_air_date).getTime()
      )
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        original_name: c.original_name ?? c.name,
        poster_path: c.poster_path,
        backdrop_path: c.backdrop_path,
        first_air_date: c.first_air_date,
        vote_average: c.vote_average,
        vote_count: c.vote_count,
        genre_ids: c.genre_ids ?? [],
        overview: c.overview ?? '',
        popularity: c.popularity ?? 0,
        character: c.job ?? '',
        credit_id: c.credit_id,
        episode_count: c.episode_count ?? 0,
      }));

    const response: PersonDetailResponse = {
      person,
      movieCredits,
      crewCredits,
      tvCredits,
      tvCrewCredits,
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
