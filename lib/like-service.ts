import { supabase } from './supabase';

export interface LikeStatusResponse {
  liked: boolean;
  likeCount: number;
}

/**
 * Toggle like via edge function (handles insert/delete + count update atomically)
 */
export async function toggleLike(
  targetType: 'review' | 'first_take',
  targetId: string
): Promise<LikeStatusResponse> {
  const { data, error } = await supabase.functions.invoke<LikeStatusResponse>(
    'like-review',
    { body: { target_type: targetType, target_id: targetId } }
  );

  if (error) {
    throw new Error(error.message || 'Failed to toggle like');
  }

  if (!data) {
    throw new Error('No data returned from like toggle');
  }

  return data;
}

/**
 * Fetch like status directly from DB (for initial load, avoids edge function overhead)
 */
export async function fetchLikeStatus(
  userId: string,
  targetType: 'review' | 'first_take',
  targetId: string
): Promise<LikeStatusResponse> {
  // Check if user has liked this
  const likeQuery = supabase
    .from('review_likes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (targetType === 'review') {
    likeQuery.eq('review_id', targetId);
  } else {
    likeQuery.eq('first_take_id', targetId);
  }

  const { count: likeExists, error: likeError } = await likeQuery;

  if (likeError) {
    throw new Error(likeError.message);
  }

  // Get the like_count from the target table
  const table = targetType === 'review' ? 'reviews' : 'first_takes';
  const { data: targetData, error: targetError } = await supabase
    .from(table)
    .select('like_count')
    .eq('id', targetId)
    .single();

  if (targetError) {
    throw new Error(targetError.message);
  }

  return {
    liked: (likeExists ?? 0) > 0,
    likeCount: (targetData as any)?.like_count ?? 0,
  };
}

export interface LikerInfo {
  userId: string;
  fullName: string | null;
  username: string | null;
}

export interface LikedByResponse {
  likers: LikerInfo[];
  totalCount: number;
}

/**
 * Fetch top likers for a review/first_take (prioritizing followed users)
 */
export async function fetchLikedBy(
  targetType: 'review' | 'first_take',
  targetId: string,
  currentUserId?: string
): Promise<LikedByResponse> {
  const column = targetType === 'review' ? 'review_id' : 'first_take_id';
  const table = targetType === 'review' ? 'reviews' : 'first_takes';

  const { data: targetData } = await supabase
    .from(table)
    .select('like_count')
    .eq('id', targetId)
    .single();
  const totalCount = (targetData as any)?.like_count ?? 0;

  if (totalCount === 0) {
    return { likers: [], totalCount: 0 };
  }

  const { data: likesData, error } = await (supabase
    .from('review_likes') as any)
    .select(`
      user_id,
      profiles (
        full_name,
        username
      )
    `)
    .eq(column, targetId)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error || !likesData) {
    return { likers: [], totalCount };
  }

  const likers: LikerInfo[] = likesData.map((like: any) => ({
    userId: like.user_id,
    fullName: like.profiles?.full_name ?? null,
    username: like.profiles?.username ?? null,
  }));

  if (currentUserId && likers.length > 0) {
    const { data: follows } = await (supabase
      .from('follows') as any)
      .select('following_id')
      .eq('follower_id', currentUserId);

    const followedIds = new Set((follows ?? []).map((f: any) => f.following_id));
    likers.sort((a, b) => {
      const aFollowed = followedIds.has(a.userId) ? 1 : 0;
      const bFollowed = followedIds.has(b.userId) ? 1 : 0;
      return bFollowed - aFollowed;
    });
  }

  return { likers, totalCount };
}

export interface LikedReviewItem {
  id: string;
  likedAt: string;
  targetType: 'review' | 'first_take';
  targetId: string;
  movieTitle: string;
  posterPath: string | null;
  title: string | null;
  reviewText: string | null;
  quoteText: string | null;
  rating: number | null;
  isSpoiler: boolean;
  isRewatch: boolean;
  likeCount: number;
  createdAt: string;
  reviewerName: string | null;
  reviewerUsername: string | null;
  reviewerAvatar: string | null;
}

/**
 * Fetch all reviews/first_takes the user has liked
 */
export async function fetchLikedReviews(userId: string): Promise<LikedReviewItem[]> {
  const [ftResult, rResult] = await Promise.all([
    (supabase.from('review_likes') as any)
      .select(`
        id,
        created_at,
        first_take_id,
        first_takes!review_likes_first_take_id_fkey (
          id, movie_title, poster_path, quote_text, rating, is_spoiler, like_count, created_at,
          profiles!first_takes_user_id_profiles_fkey ( full_name, username, avatar_url )
        )
      `)
      .eq('user_id', userId)
      .not('first_take_id', 'is', null)
      .order('created_at', { ascending: false }),
    (supabase.from('review_likes') as any)
      .select(`
        id,
        created_at,
        review_id,
        reviews!review_likes_review_id_fkey (
          id, movie_title, poster_path, title, review_text, rating, is_spoiler, is_rewatch, like_count, created_at,
          profiles!reviews_user_id_fkey ( full_name, username, avatar_url )
        )
      `)
      .eq('user_id', userId)
      .not('review_id', 'is', null)
      .order('created_at', { ascending: false }),
  ]);

  const items: LikedReviewItem[] = [];

  if (ftResult.data && !ftResult.error) {
    for (const like of ftResult.data) {
      const ft = like.first_takes;
      if (!ft) continue;
      items.push({
        id: like.id,
        likedAt: like.created_at,
        targetType: 'first_take',
        targetId: ft.id,
        movieTitle: ft.movie_title,
        posterPath: ft.poster_path,
        title: null,
        reviewText: null,
        quoteText: ft.quote_text,
        rating: ft.rating,
        isSpoiler: ft.is_spoiler,
        isRewatch: false,
        likeCount: ft.like_count ?? 0,
        createdAt: ft.created_at,
        reviewerName: ft.profiles?.full_name ?? null,
        reviewerUsername: ft.profiles?.username ?? null,
        reviewerAvatar: ft.profiles?.avatar_url ?? null,
      });
    }
  }

  if (rResult.data && !rResult.error) {
    for (const like of rResult.data) {
      const r = like.reviews;
      if (!r) continue;
      items.push({
        id: like.id,
        likedAt: like.created_at,
        targetType: 'review',
        targetId: r.id,
        movieTitle: r.movie_title,
        posterPath: r.poster_path,
        title: r.title,
        reviewText: r.review_text,
        quoteText: null,
        rating: r.rating,
        isSpoiler: r.is_spoiler,
        isRewatch: r.is_rewatch ?? false,
        likeCount: r.like_count ?? 0,
        createdAt: r.created_at,
        reviewerName: r.profiles?.full_name ?? null,
        reviewerUsername: r.profiles?.username ?? null,
        reviewerAvatar: r.profiles?.avatar_url ?? null,
      });
    }
  }

  items.sort((a, b) => new Date(b.likedAt).getTime() - new Date(a.likedAt).getTime());
  return items;
}
