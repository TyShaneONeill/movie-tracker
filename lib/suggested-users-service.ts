import { supabase } from './supabase';
import { captureException } from '@/lib/sentry';

export interface SuggestedUser {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  followersCount: number;
  reason: string;
  reasonType: 'mutual_followers' | 'similar_taste' | 'mixed';
  score: number;
}

interface SuggestedUsersResponse {
  suggestions: SuggestedUser[];
}

export async function fetchSuggestedUsers(): Promise<SuggestedUser[]> {
  const { data, error } = await supabase.functions.invoke<SuggestedUsersResponse>(
    'get-suggested-users'
  );

  if (error) {
    captureException(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'fetch-suggested-users' }
    );
    throw new Error(error.message || 'Failed to fetch suggested users');
  }

  if (!data) {
    throw new Error('No data returned from suggested users');
  }

  return data.suggestions;
}
