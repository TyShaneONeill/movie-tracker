import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Only allow DELETE or POST method
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Get the authorization header to extract user ID
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Create user client to get user info (validates the JWT)
    const supabaseUserClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Rate limit: 3 requests per day
    const rateLimited = await enforceRateLimit(userId, 'delete_account', 3, 86400, req);
    if (rateLimited) return rateLimited;

    // Create service client for admin operations (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Delete user data in order to respect foreign key constraints
    // 1. Delete list_movies (references user_lists)
    const { data: userLists } = await supabaseAdmin
      .from('user_lists')
      .select('id')
      .eq('user_id', userId);

    if (userLists && userLists.length > 0) {
      const listIds = userLists.map(list => list.id);
      const { error: listMoviesError } = await supabaseAdmin
        .from('list_movies')
        .delete()
        .in('list_id', listIds);

      if (listMoviesError) {
        console.error('[delete-account] Failed to delete list movies:', listMoviesError);
        throw new Error(`Failed to delete list movies: ${listMoviesError.message}`);
      }
    }

    // 2. Delete user_lists
    const { error: userListsError } = await supabaseAdmin
      .from('user_lists')
      .delete()
      .eq('user_id', userId);

    if (userListsError) {
      console.error('[delete-account] Failed to delete user lists:', userListsError);
      throw new Error(`Failed to delete user lists: ${userListsError.message}`);
    }

    // 3. Delete first_takes
    const { error: firstTakesError } = await supabaseAdmin
      .from('first_takes')
      .delete()
      .eq('user_id', userId);

    if (firstTakesError) {
      console.error('[delete-account] Failed to delete first takes:', firstTakesError);
      throw new Error(`Failed to delete first takes: ${firstTakesError.message}`);
    }

    // 4. Delete user_movie_likes
    const { error: movieLikesError } = await supabaseAdmin
      .from('user_movie_likes')
      .delete()
      .eq('user_id', userId);

    if (movieLikesError) {
      console.error('[delete-account] Failed to delete movie likes:', movieLikesError);
      throw new Error(`Failed to delete movie likes: ${movieLikesError.message}`);
    }

    // 5. Delete user_movies
    const { error: userMoviesError } = await supabaseAdmin
      .from('user_movies')
      .delete()
      .eq('user_id', userId);

    if (userMoviesError) {
      console.error('[delete-account] Failed to delete user movies:', userMoviesError);
      throw new Error(`Failed to delete user movies: ${userMoviesError.message}`);
    }

    // 6. Delete user_episode_watches (references user_tv_shows, so delete first)
    const { error: episodeWatchesError } = await supabaseAdmin
      .from('user_episode_watches')
      .delete()
      .eq('user_id', userId);

    if (episodeWatchesError) {
      console.error('[delete-account] Failed to delete episode watches:', episodeWatchesError);
      throw new Error(`Failed to delete episode watches: ${episodeWatchesError.message}`);
    }

    // 7. Delete user_tv_show_likes
    const { error: tvShowLikesError } = await supabaseAdmin
      .from('user_tv_show_likes')
      .delete()
      .eq('user_id', userId);

    if (tvShowLikesError) {
      console.error('[delete-account] Failed to delete TV show likes:', tvShowLikesError);
      throw new Error(`Failed to delete TV show likes: ${tvShowLikesError.message}`);
    }

    // 8. Delete user_tv_shows
    const { error: userTvShowsError } = await supabaseAdmin
      .from('user_tv_shows')
      .delete()
      .eq('user_id', userId);

    if (userTvShowsError) {
      console.error('[delete-account] Failed to delete TV shows:', userTvShowsError);
      throw new Error(`Failed to delete TV shows: ${userTvShowsError.message}`);
    }

    // 9. Delete theater_visits
    const { error: theaterVisitsError } = await supabaseAdmin
      .from('theater_visits')
      .delete()
      .eq('user_id', userId);

    if (theaterVisitsError) {
      console.error('[delete-account] Failed to delete theater visits:', theaterVisitsError);
      throw new Error(`Failed to delete theater visits: ${theaterVisitsError.message}`);
    }

    // 10. Delete rate_limits
    const { error: rateLimitsError } = await supabaseAdmin
      .from('rate_limits')
      .delete()
      .eq('user_id', userId);

    if (rateLimitsError) {
      console.error('[delete-account] Failed to delete rate limits:', rateLimitsError);
      throw new Error(`Failed to delete rate limits: ${rateLimitsError.message}`);
    }

    // 11. Delete scan_usage
    const { error: scanUsageError } = await supabaseAdmin
      .from('scan_usage')
      .delete()
      .eq('user_id', userId);

    if (scanUsageError) {
      console.error('[delete-account] Failed to delete scan usage:', scanUsageError);
      throw new Error(`Failed to delete scan usage: ${scanUsageError.message}`);
    }

    // 12. Delete profiles
    const { error: profilesError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profilesError) {
      console.error('[delete-account] Failed to delete profile:', profilesError);
      throw new Error(`Failed to delete profile: ${profilesError.message}`);
    }

    // 13. Finally, delete the auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error('[delete-account] Failed to delete auth user:', authDeleteError);
      throw new Error(`Failed to delete auth user: ${authDeleteError.message}`);
    }

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account deleted successfully',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[delete-account] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
