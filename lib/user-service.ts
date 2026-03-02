import { supabase } from './supabase';

export interface UserSearchResult {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
  following_count: number | null;
  movie_count: number;
}

/**
 * Search users by username or full_name (case-insensitive, partial match)
 * Returns profile data including movie count (count of user_movies where status='watched')
 * Excludes the current user from results
 */
export async function searchUsers(
  query: string,
  currentUserId?: string
): Promise<UserSearchResult[]> {
  // Return empty array for empty queries
  if (!query.trim()) {
    return [];
  }

  const searchPattern = `%${query.trim()}%`;

  // Query profiles with case-insensitive partial match on username or full_name
  let queryBuilder = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, followers_count, following_count')
    .or(`username.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
    .order('username', { ascending: true, nullsFirst: false })
    .limit(20);

  // Exclude current user if provided
  if (currentUserId) {
    queryBuilder = queryBuilder.neq('id', currentUserId);
  }

  const { data: profiles, error } = await queryBuilder;

  if (error) {
    throw new Error(error.message || 'Failed to search users');
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  // Get movie counts for all matching users using HEAD count queries (no row data transferred)
  const userIds = profiles.map((p) => p.id);

  const countResults = await Promise.all(
    userIds.map((userId) =>
      supabase
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'watched')
    )
  );

  // Build a map of user_id to movie count
  const countMap = new Map<string, number>();
  userIds.forEach((userId, i) => {
    const { count, error: countError } = countResults[i];
    if (countError) {
      throw new Error(countError.message || 'Failed to fetch movie counts');
    }
    countMap.set(userId, count ?? 0);
  });

  // Combine profiles with movie counts
  const results: UserSearchResult[] = profiles.map((profile) => ({
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    movie_count: countMap.get(profile.id) || 0,
  }));

  return results;
}
