import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

type SortMode = 'recent' | 'popular' | 'friends_first';

interface GetMovieReviewsRequest {
  tmdb_id: number;
  page?: number;
  limit?: number;
  sort?: SortMode;
  media_type?: string;
}

interface FirstTakeRow {
  id: string;
  user_id: string;
  rating: number | null;
  quote_text: string;
  is_spoiler: boolean;
  like_count: number;
  created_at: string;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface ReviewTableRow {
  id: string;
  user_id: string;
  rating: number;
  title: string;
  review_text: string;
  is_spoiler: boolean;
  is_rewatch: boolean;
  like_count: number;
  created_at: string;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface ReviewResponse {
  id: string;
  userId: string;
  rating: number | null;
  quoteText: string;
  title: string | null;
  reviewText: string | null;
  isSpoiler: boolean;
  isRewatch: boolean;
  likeCount: number;
  createdAt: string;
  source: 'first_take' | 'review';
  reviewer: {
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

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

    // Parse request body
    const { tmdb_id, page: rawPage, limit: rawLimit, sort: rawSort, media_type: rawMediaType }: GetMovieReviewsRequest = await req.json();
    const sort: SortMode = rawSort === 'popular' ? 'popular' : rawSort === 'friends_first' ? 'friends_first' : 'recent';
    const mediaType = rawMediaType ?? 'movie';

    if (!tmdb_id || typeof tmdb_id !== 'number' || tmdb_id <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid tmdb_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const page = Math.max(1, Math.floor(rawPage || 1));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit || DEFAULT_LIMIT)));

    // IP-based rate limit: 100 requests per hour (no auth required)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_movie_reviews', 100, 3600, req);
    if (rateLimited) return rateLimited;

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // For friends_first sort, extract authenticated user's followed list
    let followedUserIds: string[] = [];
    if (sort === 'friends_first') {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabaseClient.auth.getUser(token);
        if (user) {
          const { data: follows } = await supabaseClient
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          followedUserIds = (follows ?? []).map((f: { following_id: string }) => f.following_id);
        }
      }
    }

    // Query both tables in parallel
    const [firstTakesResult, reviewsResult] = await Promise.all([
      supabaseClient
        .from('first_takes')
        .select(`
          id,
          user_id,
          rating,
          quote_text,
          is_spoiler,
          like_count,
          created_at,
          profiles!first_takes_user_id_profiles_fkey (
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', mediaType)
        .eq('visibility', 'public'),
      supabaseClient
        .from('reviews')
        .select(`
          id,
          user_id,
          rating,
          title,
          review_text,
          is_spoiler,
          is_rewatch,
          like_count,
          created_at,
          profiles!reviews_user_id_fkey (
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', mediaType)
        .eq('visibility', 'public'),
    ]);

    if (firstTakesResult.error) {
      console.error('[get-movie-reviews] First takes query error:', firstTakesResult.error);
      throw new Error('Failed to fetch first takes');
    }
    if (reviewsResult.error) {
      console.error('[get-movie-reviews] Reviews query error:', reviewsResult.error);
      throw new Error('Failed to fetch reviews');
    }

    // Map first_takes to response format
    const firstTakeItems: ReviewResponse[] = ((firstTakesResult.data || []) as FirstTakeRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      rating: row.rating,
      quoteText: row.quote_text,
      title: null,
      reviewText: null,
      isSpoiler: row.is_spoiler,
      isRewatch: false,
      likeCount: row.like_count ?? 0,
      createdAt: row.created_at,
      source: 'first_take' as const,
      reviewer: {
        fullName: row.profiles?.full_name ?? null,
        username: row.profiles?.username ?? null,
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
    }));

    // Map reviews to response format
    const reviewItems: ReviewResponse[] = ((reviewsResult.data || []) as ReviewTableRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      rating: row.rating,
      quoteText: '',
      title: row.title,
      reviewText: row.review_text,
      isSpoiler: row.is_spoiler,
      isRewatch: row.is_rewatch,
      likeCount: row.like_count ?? 0,
      createdAt: row.created_at,
      source: 'review' as const,
      reviewer: {
        fullName: row.profiles?.full_name ?? null,
        username: row.profiles?.username ?? null,
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
    }));

    // Merge and sort
    const allItems = [...firstTakeItems, ...reviewItems].sort((a, b) => {
      if (sort === 'friends_first' && followedUserIds.length > 0) {
        const aIsFriend = followedUserIds.includes(a.userId) ? 1 : 0;
        const bIsFriend = followedUserIds.includes(b.userId) ? 1 : 0;
        if (aIsFriend !== bIsFriend) return bIsFriend - aIsFriend;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === 'popular') {
        if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalCount = allItems.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const offset = (page - 1) * limit;
    const reviews = allItems.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({ reviews, page, totalPages, totalCount }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[get-movie-reviews] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
