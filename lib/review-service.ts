import { supabase } from './supabase';

export interface ReviewerInfo {
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface ReviewItem {
  id: string;
  userId: string;
  rating: number | null;
  quoteText: string;
  title: string | null;
  isSpoiler: boolean;
  isRewatch: boolean;
  createdAt: string;
  reviewer: ReviewerInfo;
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

// Fetch community reviews for a movie
export async function fetchMovieReviews(
  tmdbId: number,
  page: number = 1,
  limit: number = 20
): Promise<MovieReviewsResponse> {
  const { data, error } = await supabase.functions.invoke<MovieReviewsResponse>(
    'get-movie-reviews',
    {
      body: { tmdb_id: tmdbId, page, limit },
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
