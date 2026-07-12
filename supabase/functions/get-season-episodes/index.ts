import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Module-scope Supabase client for catalog upserts. Reused across warm requests
// (Deno isolates may persist between invocations). Null when env vars are missing —
// in that case the upsert block inside the handler is skipped entirely.
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
if (!supabase) {
  console.warn('[get-season-episodes] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — catalog upsert disabled');
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
    const { showId, seasonNumber } = await req.json();
    if (!showId || typeof showId !== 'number' || showId <= 0) {
      return new Response(JSON.stringify({
        error: 'Valid showId parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (seasonNumber === undefined || typeof seasonNumber !== 'number' || seasonNumber < 0) {
      return new Response(JSON.stringify({
        error: 'Valid seasonNumber parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}`);
    seasonUrl.searchParams.set('api_key', TMDB_API_KEY);
    const seasonResponse = await fetch(seasonUrl.toString());
    if (!seasonResponse.ok) {
      if (seasonResponse.status === 404) {
        return new Response(JSON.stringify({
          error: 'Season not found'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      throw new Error(`TMDB API error: ${seasonResponse.status}`);
    }
    const seasonData = await seasonResponse.json();
    const episodes = (seasonData.episodes || []).map((ep)=>({
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
        guest_stars: (ep.guest_stars || []).map((gs)=>({
            id: gs.id,
            name: gs.name,
            character: gs.character ?? '',
            profile_path: gs.profile_path ?? null
          }))
      }));
    const response = {
      episodes,
      seasonNumber: seasonData.season_number,
      name: seasonData.name ?? '',
      overview: seasonData.overview ?? '',
      posterPath: seasonData.poster_path ?? null
    };
    // Phase 4c catalog: upsert episodes into public.tv_show_episodes.
    // Fail-open — TMDB payload is the contract; catalog is enrichment.
    try {
      if (supabase && episodes.length > 0) {
        const catalogRows = episodes.map((ep)=>({
            tmdb_show_id: showId,
            season_number: seasonNumber,
            episode_number: ep.episode_number,
            name: ep.name || null,
            overview: ep.overview || null,
            air_date: ep.air_date,
            runtime: ep.runtime,
            still_path: ep.still_path,
            tmdb_vote_average: ep.vote_average,
            tmdb_vote_count: ep.vote_count,
            refreshed_at: new Date().toISOString()
          }));
        const { error: upsertError } = await supabase.from('tv_show_episodes').upsert(catalogRows, {
          onConflict: 'tmdb_show_id,season_number,episode_number'
        });
        if (upsertError) {
          console.warn('[get-season-episodes] catalog upsert failed:', upsertError.message);
        }
      }
    } catch (catalogErr) {
      console.warn('[get-season-episodes] catalog population error:', catalogErr);
    }
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
