import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface GetFriendsRatingsRequest {
  tmdb_id: number;
}

interface FirstTakeRow {
  user_id: string;
  rating: number | null;
  quote_text: string;
  is_spoiler: boolean;
  created_at: string;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface ReviewTableRow {
  user_id: string;
  rating: number;
  title: string;
  review_text: string;
  is_spoiler: boolean;
  is_rewatch: boolean;
  created_at: string;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface FriendRatingResponse {
  userId: string;
  rating: number | null;
  quoteText: string;
  title: string | null;
  reviewText: string | null;
  isSpoiler: boolean;
  isRewatch: boolean;
  createdAt: string;
  source: 'first_take' | 'review';
  reviewer: {
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
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

    // Authenticate user
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

    // User-based rate limit: 200 requests per hour
    const rateLimited = await enforceRateLimit(user.id, 'get_friends_ratings', 200, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { tmdb_id }: GetFriendsRatingsRequest = await req.json();

    if (!tmdb_id || typeof tmdb_id !== 'number' || tmdb_id <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid tmdb_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get IDs of users this person follows
    const { data: followRows, error: followError } = await adminClient
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followError) {
      console.error('[get-friends-ratings] Follows query error:', followError);
      throw new Error('Failed to fetch follows');
    }

    const followingIds = (followRows || []).map((r) => r.following_id);

    // If user follows nobody, return empty
    if (followingIds.length === 0) {
      return new Response(
        JSON.stringify({ friendsRatings: [], averageRating: null, totalFriendsWhoRated: 0 }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Query both tables in parallel
    const [firstTakesResult, reviewsResult] = await Promise.all([
      adminClient
        .from('first_takes')
        .select(`
          user_id,
          rating,
          quote_text,
          is_spoiler,
          created_at,
          profiles!first_takes_user_id_profiles_fkey (
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', 'movie')
        .in('user_id', followingIds)
        .in('visibility', ['public', 'followers_only']),
      adminClient
        .from('reviews')
        .select(`
          user_id,
          rating,
          title,
          review_text,
          is_spoiler,
          is_rewatch,
          created_at,
          profiles!reviews_user_id_fkey (
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', 'movie')
        .in('user_id', followingIds)
        .in('visibility', ['public', 'followers_only']),
    ]);

    if (firstTakesResult.error) {
      console.error('[get-friends-ratings] First takes query error:', firstTakesResult.error);
      throw new Error('Failed to fetch friends first takes');
    }
    if (reviewsResult.error) {
      console.error('[get-friends-ratings] Reviews query error:', reviewsResult.error);
      throw new Error('Failed to fetch friends reviews');
    }

    // Map first_takes
    const firstTakeItems: FriendRatingResponse[] = ((firstTakesResult.data || []) as FirstTakeRow[]).map((row) => ({
      userId: row.user_id,
      rating: row.rating,
      quoteText: row.quote_text,
      title: null,
      reviewText: null,
      isSpoiler: row.is_spoiler,
      isRewatch: false,
      createdAt: row.created_at,
      source: 'first_take' as const,
      reviewer: {
        fullName: row.profiles?.full_name ?? null,
        username: row.profiles?.username ?? null,
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
    }));

    // Map reviews
    const reviewItems: FriendRatingResponse[] = ((reviewsResult.data || []) as ReviewTableRow[]).map((row) => ({
      userId: row.user_id,
      rating: row.rating,
      quoteText: '',
      title: row.title,
      reviewText: row.review_text,
      isSpoiler: row.is_spoiler,
      isRewatch: row.is_rewatch,
      createdAt: row.created_at,
      source: 'review' as const,
      reviewer: {
        fullName: row.profiles?.full_name ?? null,
        username: row.profiles?.username ?? null,
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
    }));

    // Merge — a friend may have both a first take AND a review; include both
    const friendsRatings = [...firstTakeItems, ...reviewItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Compute average rating (count each unique user only once — prefer review rating if both exist)
    const ratingByUser = new Map<string, number>();
    for (const item of friendsRatings) {
      if (item.rating !== null) {
        // Reviews take priority over first takes for average calculation
        if (!ratingByUser.has(item.userId) || item.source === 'review') {
          ratingByUser.set(item.userId, item.rating);
        }
      }
    }

    const numericRatings = Array.from(ratingByUser.values());
    const averageRating = numericRatings.length > 0
      ? Math.round((numericRatings.reduce((sum, r) => sum + r, 0) / numericRatings.length) * 10) / 10
      : null;

    return new Response(
      JSON.stringify({
        friendsRatings,
        averageRating,
        totalFriendsWhoRated: numericRatings.length,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[get-friends-ratings] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
