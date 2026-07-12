import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
const TMDB_BASE = "https://api.themoviedb.org/3";
Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const { region = "US" } = await req.json().catch(()=>({}));
    const url = `${TMDB_BASE}/watch/providers/movie?api_key=${TMDB_API_KEY}&watch_region=${region}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TMDB API error: ${res.status}`);
    }
    const data = await res.json();
    const providers = (data.results || []).map((p)=>({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path
      }));
    providers.sort((a, b)=>a.provider_name.localeCompare(b.provider_name));
    return new Response(JSON.stringify({
      providers,
      total: providers.length
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      error: message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
