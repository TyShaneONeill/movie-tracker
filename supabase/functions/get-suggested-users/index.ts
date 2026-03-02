import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface RawSuggestion {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  followers_count: number;
  mutual_count: number;
  mutual_usernames: string[];
  shared_movie_count: number;
  is_active: boolean;
}

interface SuggestedUser {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  followersCount: number;
  reason: string;
  reasonType: 'mutual_followers' | 'similar_taste' | 'mixed';
  score: number;
}

function buildReason(row: RawSuggestion): { reason: string; reasonType: SuggestedUser['reasonType'] } {
  const hasMutual = row.mutual_count > 0;
  const hasShared = row.shared_movie_count > 0;

  let reason: string;
  let reasonType: SuggestedUser['reasonType'];

  if (hasMutual && hasShared) {
    reasonType = 'mixed';
  } else if (hasMutual) {
    reasonType = 'mutual_followers';
  } else {
    reasonType = 'similar_taste';
  }

  if (hasMutual) {
    const names = row.mutual_usernames || [];
    if (names.length === 1) {
      reason = `Followed by @${names[0]}`;
    } else if (names.length === 2) {
      reason = `Followed by @${names[0]} and @${names[1]}`;
    } else if (names.length > 2) {
      reason = `Followed by @${names[0]} and ${names.length - 1} others you follow`;
    } else {
      reason = `${row.mutual_count} mutual follower${row.mutual_count > 1 ? 's' : ''}`;
    }
  } else {
    reason = `${row.shared_movie_count} movie${row.shared_movie_count > 1 ? 's' : ''} in common`;
  }

  return { reason, reasonType };
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUserClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const rateLimited = await enforceRateLimit(user.id, 'get_suggested_users', 30, 3600, req);
    if (rateLimited) return rateLimited;

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: rawSuggestions, error: rpcError } = await supabaseClient.rpc(
      'get_suggested_users',
      { p_user_id: user.id }
    );

    if (rpcError) {
      console.error('[get-suggested-users] RPC error:', rpcError);
      throw new Error(rpcError.message || 'Failed to get suggestions');
    }

    const suggestions: SuggestedUser[] = (rawSuggestions || []).map((row: RawSuggestion) => {
      const { reason, reasonType } = buildReason(row);
      const score = row.mutual_count * 3 + row.shared_movie_count * 1 + (row.is_active ? 2 : 0);

      return {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        followersCount: row.followers_count,
        reason,
        reasonType,
        score,
      };
    });

    return new Response(
      JSON.stringify({ suggestions }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[get-suggested-users] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
