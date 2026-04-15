import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const ALLOWED_TYPES = new Set([
  'follow', 'like', 'add_title', 'first_take', 'comment', 'mark_watched',
]);

const EARN_THRESHOLDS: Record<string, number> = {
  follow: 1,
  like: 50,
  add_title: 1,
  first_take: 10,
  comment: 10,
  mark_watched: 1,
  milestone: 1,
};

// Simple deterministic hash (FNV-1a variant) — produces a positive 32-bit int
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

// Helper: count actual source actions for this user
async function getSourceCount(
  adminClient: any,
  userId: string,
  actionType: string
): Promise<number> {
  switch (actionType) {
    case 'first_take': {
      const { count } = await adminClient
        .from('first_takes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count ?? 0;
    }
    case 'comment': {
      const { count } = await adminClient
        .from('review_comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count ?? 0;
    }
    case 'like': {
      const { count } = await adminClient
        .from('review_likes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count ?? 0;
    }
    default:
      return 1; // threshold=1 types don't need source count check
  }
}

// Helper: count kernels already earned of this type
async function getEarnedCount(
  adminClient: any,
  userId: string,
  actionType: string
): Promise<number> {
  const { count } = await adminClient
    .from('user_popcorn')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', actionType);
  return count ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 120 earn calls per hour per user
    const rateLimited = await enforceRateLimit(user.id, 'earn_popcorn', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action_type, reference_id } = await req.json();

    if (!action_type || !ALLOWED_TYPES.has(action_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action_type' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const corsHeaders = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
    const threshold = EARN_THRESHOLDS[action_type] ?? 1;

    if (threshold > 1) {
      const [sourceCount, earnedCount] = await Promise.all([
        getSourceCount(adminClient, user.id, action_type),
        getEarnedCount(adminClient, user.id, action_type),
      ]);

      const owed = Math.floor(sourceCount / threshold) - earnedCount;

      if (owed <= 0) {
        return new Response(
          JSON.stringify({ earned: false, kernel: null }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    const kernelId = crypto.randomUUID();
    const seed = hashString(kernelId);
    const referenceIdToStore = threshold === 1 ? (reference_id ?? null) : null;

    const { data, error: insertError } = await adminClient
      .from('user_popcorn')
      .insert({
        id: kernelId,
        user_id: user.id,
        action_type,
        reference_id: referenceIdToStore,
        seed,
        is_milestone: false,
      })
      .select()
      .single();

    // Duplicate — already earned for this reference_id (unique constraint)
    if (insertError?.code === '23505') {
      return new Response(
        JSON.stringify({ earned: false, kernel: null }),
        { status: 200, headers: corsHeaders }
      );
    }
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ earned: true, kernel: data }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[earn-popcorn] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
