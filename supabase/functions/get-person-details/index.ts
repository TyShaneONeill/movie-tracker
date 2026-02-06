import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface GetPersonDetailsRequest {
  personId: number;
}

interface TMDBPerson {
  id: number;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  also_known_as: string[];
  gender: number; // 0: not specified, 1: female, 2: male, 3: non-binary
}

interface TMDBMovieCredit {
  id: number;
  title: string;
  character?: string; // For cast
  job?: string; // For crew
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  popularity: number;
}

interface TMDBCreditsResponse {
  cast: TMDBMovieCredit[];
  crew: TMDBMovieCredit[];
}

interface PersonDetailResponse {
  person: TMDBPerson;
  filmography: TMDBMovieCredit[];
  knownFor: TMDBMovieCredit[];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    // Parse request body
    const { personId }: GetPersonDetailsRequest = await req.json();

    if (!personId || typeof personId !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Valid personId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch person details
    const personResponse = await fetch(
      `https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_API_KEY}&language=en-US`
    );

    if (!personResponse.ok) {
      if (personResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Person not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TMDB API error: ${personResponse.status}`);
    }

    const person: TMDBPerson = await personResponse.json();

    // Fetch movie credits
    const creditsResponse = await fetch(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}&language=en-US`
    );

    if (!creditsResponse.ok) {
      throw new Error(`TMDB credits API error: ${creditsResponse.status}`);
    }

    const credits: TMDBCreditsResponse = await creditsResponse.json();

    // Build filmography - combine cast and crew, dedupe, sort by release date
    const allCredits = new Map<number, TMDBMovieCredit>();

    // Add cast credits (acting roles)
    for (const credit of credits.cast) {
      if (!allCredits.has(credit.id)) {
        allCredits.set(credit.id, credit);
      }
    }

    // Add crew credits for directors (if they're known for directing)
    if (person.known_for_department === 'Directing') {
      for (const credit of credits.crew) {
        if (credit.job === 'Director' && !allCredits.has(credit.id)) {
          allCredits.set(credit.id, credit);
        }
      }
    }

    // Convert to array and sort by release date (newest first)
    const filmography = Array.from(allCredits.values())
      .filter(movie => movie.release_date) // Only include movies with release dates
      .sort((a, b) => {
        const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
        const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
        return dateB - dateA;
      });

    // Get "Known For" - top 5 by popularity
    const knownFor = [...filmography]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 5);

    const response: PersonDetailResponse = {
      person,
      filmography,
      knownFor,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error fetching person details:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
