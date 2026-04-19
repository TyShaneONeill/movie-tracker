// DEPLOY NOTE:
// This function MUST be deployed with --no-verify-jwt:
//   supabase functions deploy get-tv-show-details --no-verify-jwt
//
// Without that flag, Supabase rejects invocations from the client SDK when the
// user's session JWT doesn't pass the default verification layer, surfacing as
// "Edge Function returned a non-2xx status code" on the client. The function
// itself doesn't need JWT validation — it only hits TMDB using the service's
// own TMDB_API_KEY. Matches the deploy convention used by get-season-episodes.
//
// Secret required on Supabase:
//   supabase secrets set TMDB_API_KEY=<v3-api-key>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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

    const url = `${TMDB_BASE_URL}/tv/${showId}?api_key=${TMDB_API_KEY}&language=en-US`;
    const res = await fetch(url);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `TMDB responded with ${res.status}` }),
        { status: res.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();

    return new Response(
      JSON.stringify(data),
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
