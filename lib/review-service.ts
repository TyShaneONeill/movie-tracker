import { supabase } from './supabase';
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

  return data;
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
    media_type: 'movie',
    movie_title: data.movieTitle,
    poster_path: data.posterPath,
    title: data.title.trim(),
    review_text: data.reviewText.trim(),
    rating: Math.round(data.rating),
    is_spoiler: data.isSpoiler,
    is_rewatch: data.isRewatch,
    visibility: data.visibility,
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
    ...(updates.rating !== undefined && { rating: Math.round(updates.rating) }),
    ...(updates.isSpoiler !== undefined && { is_spoiler: updates.isSpoiler }),
    ...(updates.isRewatch !== undefined && { is_rewatch: updates.isRewatch }),
    ...(updates.visibility !== undefined && { visibility: updates.visibility }),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = (await (supabase
    .from('reviews') as any)
    .update(updateData)
    .eq('id', reviewId)
    .select()
    .single()) as { data: Review; error: any };

  if (error) {
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
