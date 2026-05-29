// DEPLOY NOTE:
// This function MUST be deployed with --no-verify-jwt:
//   supabase functions deploy get-tv-show-details --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh
//
// Without that flag, Supabase rejects invocations that don't carry a valid
// session JWT — including anonymous web visitors opening a shared /tv/{id}
// link — surfacing as "Edge Function returned a non-2xx status code" on the
// client. The function itself doesn't need JWT validation: it only hits TMDB
// using the service's own TMDB_API_KEY. Matches the deploy convention used by
// get-season-episodes. (CLAUDE.md's "all other functions use standard JWT"
// note does not apply to the public TMDB passthrough functions.)
//
// Secret required on Supabase:
//   supabase secrets set TMDB_API_KEY=<v3-api-key>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { selectBestTrailer } from '../_shared/select-best-trailer.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Cap on cast entries returned. The detail screen renders cast.slice(0, 10);
// 20 keeps the payload lean while leaving headroom for future UI.
const MAX_CAST = 20;

interface RequestBody {
  showId: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const { showId } = await req.json() as RequestBody;

    if (!showId || typeof showId !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid showId' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // append_to_response lets us fetch credits, videos, watch providers and
    // recommendations in a single TMDB round-trip. The client expects a
    // reshaped TvShowDetailResponse ({ show, cast, crew, trailer,
    // watchProviders, seasons, recommendations }), NOT the raw TMDB payload.
    const url =
      `${TMDB_BASE_URL}/tv/${showId}` +
      `?api_key=${TMDB_API_KEY}&language=en-US` +
      `&append_to_response=credits,videos,watch/providers,recommendations`;
    const res = await fetch(url);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `TMDB responded with ${res.status}` }),
        { status: res.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();

    // --- Reshape raw TMDB payload into TvShowDetailResponse ---

    // genre_ids is what the cache + UI read; TMDB detail exposes genres[{id,name}].
    const show = {
      id: data.id,
      name: data.name,
      overview: data.overview ?? '',
      poster_path: data.poster_path ?? null,
      backdrop_path: data.backdrop_path ?? null,
      first_air_date: data.first_air_date ?? '',
      last_air_date: data.last_air_date ?? null,
      vote_average: data.vote_average ?? 0,
      vote_count: data.vote_count ?? 0,
      genre_ids: Array.isArray(data.genres) ? data.genres.map((g: { id: number }) => g.id) : [],
      genres: data.genres ?? [],
      tagline: data.tagline ?? null,
      status: data.status ?? '',
      type: data.type ?? '',
      in_production: data.in_production ?? false,
      number_of_seasons: data.number_of_seasons ?? 0,
      number_of_episodes: data.number_of_episodes ?? 0,
      episode_run_time: data.episode_run_time ?? [],
      networks: data.networks ?? [],
      created_by: data.created_by ?? [],
      seasons: data.seasons ?? [],
      original_language: data.original_language ?? '',
      origin_country: data.origin_country ?? [],
    };

    const cast = (data.credits?.cast ?? [])
      .slice(0, MAX_CAST)
      .map((c: { id: number; name: string; character: string; profile_path: string | null; order: number }) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
        order: c.order,
      }));

    // Crew is kept whole: the UI filters it by job (e.g. Original Music Composer).
    const crew = (data.credits?.crew ?? []).map(
      (c: { id: number; name: string; job: string; department: string; profile_path: string | null }) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profile_path: c.profile_path,
      })
    );

    // selectBestTrailer returns just the YouTube key; the client wants the full
    // video object, so locate it back in the results list.
    const videos = data.videos ?? { results: [] };
    const trailerKey = selectBestTrailer(videos);
    const rawTrailer = trailerKey
      ? videos.results.find((v: { key: string }) => v.key === trailerKey)
      : null;
    const trailer = rawTrailer
      ? {
          id: rawTrailer.id,
          key: rawTrailer.key,
          site: rawTrailer.site,
          type: rawTrailer.type,
          official: rawTrailer.official,
          name: rawTrailer.name,
          published_at: rawTrailer.published_at,
        }
      : null;

    const watchProviders = data['watch/providers']?.results ?? {};
    const seasons = data.seasons ?? [];
    const recommendations = data.recommendations?.results ?? [];

    const body = { show, cast, crew, trailer, watchProviders, seasons, recommendations };

    return new Response(
      JSON.stringify(body),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[get-tv-show-details]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
