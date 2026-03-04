import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface GetMovieReviewsRequest {
  tmdb_id: number;
  page?: number;
  limit?: number;
}

interface ReviewRow {
  id: string;
  user_id: string;
  rating: number | null;
  quote_text: string;
  title: string | null;
  is_spoiler: boolean;
  is_rewatch: boolean;
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
  isSpoiler: boolean;
  isRewatch: boolean;
  createdAt: string;
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
    const { tmdb_id, page: rawPage, limit: rawLimit }: GetMovieReviewsRequest = await req.json();

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

    // Get total count for pagination
    const { count, error: countError } = await supabaseClient
      .from('first_takes')
      .select('id', { count: 'exact', head: true })
      .eq('tmdb_id', tmdb_id)
      .eq('media_type', 'movie')
      .eq('visibility', 'public');

    if (countError) {
      console.error('[get-movie-reviews] Count query error:', countError);
      throw new Error('Failed to count reviews');
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const offset = (page - 1) * limit;

    // Fetch reviews with reviewer profiles
    const { data: rows, error: queryError } = await supabaseClient
      .from('first_takes')
      .select(`
        id,
        user_id,
        rating,
        quote_text,
        title,
        is_spoiler,
        is_rewatch,
        created_at,
        profiles!first_takes_user_id_fkey (
          full_name,
          username,
          avatar_url
        )
      `)
      .eq('tmdb_id', tmdb_id)
      .eq('media_type', 'movie')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (queryError) {
      console.error('[get-movie-reviews] Query error:', queryError);
      throw new Error('Failed to fetch reviews');
    }

    const reviews: ReviewResponse[] = (rows as ReviewRow[] || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      rating: row.rating,
      quoteText: row.quote_text,
      title: row.title,
      isSpoiler: row.is_spoiler,
      isRewatch: row.is_rewatch,
      createdAt: row.created_at,
      reviewer: {
        fullName: row.profiles?.full_name ?? null,
        username: row.profiles?.username ?? null,
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
    }));

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
