import { supabase } from './supabase';
import { hasTakeWords } from './first-take-visibility';
import type { Review, ReviewInsert, ReviewUpdate, ReviewVisibility } from './database.types';

export interface CreateReviewData {
  tmdbId: number;
  movieTitle: string;
  posterPath: string | null;
  title: string;
  reviewText: string;
  rating: number;
  isSpoiler: boolean;
  isRewatch: boolean;
  visibility: ReviewVisibility;
  mediaType?: 'movie' | 'tv_show';
  /**
   * Provenance of the rating. Omit (or 'manual') for organically authored
   * reviews. 'tvtime_import' marks a quiet rating inked from the TV Time import
   * deck: the DB trigger skips follower notifications and the client feed /
   * profile Reviews tab exclude it. See 20260715090000_tvtime_deck_quiet_ratings.
   */
  source?: 'manual' | 'tvtime_import';
}

export interface ReviewerInfo {
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export type ReviewSortMode = 'recent' | 'popular' | 'friends_first';

export interface ReviewItem {
  id: string;
  userId: string;
  rating: number | null;
  quoteText: string;
  title: string | null;
  isSpoiler: boolean;
  isRewatch: boolean;
  likeCount: number;
  createdAt: string;
  reviewer: ReviewerInfo;
  source: 'first_take' | 'review';
  reviewText?: string;
}

export interface MovieReviewsResponse {
  reviews: ReviewItem[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface FriendsRatingsResponse {
  friendsRatings: ReviewItem[];
  averageRating: number | null;
  totalFriendsWhoRated: number;
}

// Fetch community reviews for a movie or TV show
export async function fetchMovieReviews(
  tmdbId: number,
  page: number = 1,
  limit: number = 20,
  sort: ReviewSortMode = 'recent',
  mediaType: 'movie' | 'tv_show' = 'movie'
): Promise<MovieReviewsResponse> {
  const { data, error } = await supabase.functions.invoke<MovieReviewsResponse>(
    'get-movie-reviews',
    {
      body: { tmdb_id: tmdbId, page, limit, sort, media_type: mediaType },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch movie reviews');
  }

  if (!data) {
    throw new Error('No data returned from movie reviews');
  }

  // Wordless (rating-only) first takes never render on a public surface (Ty,
  // 2026-07-31). The get-movie-reviews edge function still returns them, so the
  // filter lives at this boundary — that covers the detail-screen Community
  // Reviews section and both all-reviews screens from one place. Scoped to
  // first takes: a review always carries its own body.
  const reviews = data.reviews.filter(
    (item) => item.source !== 'first_take' || hasTakeWords(item.quoteText)
  );

  // `totalCount`/`totalPages` stay as the server computed them — the edge
  // function paginates server-side, so the client cannot restate them without
  // over-counting the pages it hasn't fetched. Tracked as a follow-up.
  return { ...data, reviews };
}

// ============================================================================
// Review CRUD operations (direct table access)
// ============================================================================

/**
 * Create a new review for a movie
 */
export async function createReview(
  userId: string,
  data: CreateReviewData
): Promise<Review> {
  const insertData: ReviewInsert = {
    user_id: userId,
    tmdb_id: data.tmdbId,
    media_type: data.mediaType ?? 'movie',
    movie_title: data.movieTitle,
    poster_path: data.posterPath,
    title: data.title.trim(),
    review_text: data.reviewText.trim(),
    // reviews.rating is numeric(3,1) as of 20260726150000 — fractional
    // values round-trip natively, no write-boundary rounding needed (was
    // Math.round() here when the column was integer; #722/#725).
    rating: data.rating,
    is_spoiler: data.isSpoiler,
    is_rewatch: data.isRewatch,
    visibility: data.visibility,
    // Only set when provided; the column defaults to 'manual' in the DB.
    ...(data.source ? { source: data.source } : {}),
  };

  const { data: result, error } = (await (supabase
    .from('reviews') as any)
    .insert(insertData)
    .select()
    .single()) as { data: Review; error: any };

  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_REVIEW');
    }
    throw new Error(error.message || 'Failed to create review');
  }

  return result;
}

/**
 * Get a user's review for a specific movie
 */
export async function getReviewByTmdbId(
  userId: string,
  tmdbId: number,
  mediaType: string = 'movie'
): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch review');
  }

  return data;
}

/**
 * Update an existing review
 */
export async function updateReview(
  reviewId: string,
  updates: Partial<Pick<CreateReviewData, 'title' | 'reviewText' | 'rating' | 'isSpoiler' | 'isRewatch' | 'visibility'>>
): Promise<Review> {
  const updateData: ReviewUpdate = {
    ...(updates.title !== undefined && { title: updates.title.trim() }),
    ...(updates.reviewText !== undefined && { review_text: updates.reviewText.trim() }),
    ...(updates.rating !== undefined && { rating: updates.rating }),
    ...(updates.isSpoiler !== undefined && { is_spoiler: updates.isSpoiler }),
    ...(updates.isRewatch !== undefined && { is_rewatch: updates.isRewatch }),
    ...(updates.visibility !== undefined && { visibility: updates.visibility }),
    updated_at: new Date().toISOString(),
  };

  // `edited_at` is stamped SERVER-SIDE by the DB trigger on genuine content
  // change (title/text/rating/spoiler); visibility-only edits leave it
  // untouched. The client no longer fetches-and-compares — it just sends the
  // update.
  const { data, error } = (await (supabase
    .from('reviews') as any)
    .update(updateData)
    .eq('id', reviewId)
    .select()
    .single()) as { data: Review; error: any };

  if (error) {
    // The edit-grace-window trigger (PS-12) rejects locked content edits with
    // HINT='edit_window_closed' and a friendly MESSAGE. Re-throw with the marker
    // in the message so `isEditWindowClosedError` can detect it upstream.
    if (
      error?.hint === 'edit_window_closed' ||
      String(error?.message ?? '').includes('edit_window_closed')
    ) {
      throw new Error('edit_window_closed');
    }
    throw new Error(error.message || 'Failed to update review');
  }

  return data;
}

/**
 * Delete a review
 */
export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId);

  if (error) {
    throw new Error(error.message || 'Failed to delete review');
  }
}

// Fetch ratings from friends who have reviewed this movie
export async function fetchFriendsRatings(
  tmdbId: number
): Promise<FriendsRatingsResponse> {
  const { data, error } = await supabase.functions.invoke<FriendsRatingsResponse>(
    'get-friends-ratings',
    {
      body: { tmdb_id: tmdbId },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch friends ratings');
  }

  if (!data) {
    throw new Error('No data returned from friends ratings');
  }

  return data;
}
