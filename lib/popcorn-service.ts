import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react-native';

export interface PopcornKernel {
  id: string;
  action_type: string;
  reference_id: string | null;
  seed: number;
  is_milestone: boolean;
  achievement_id: string | null;
  is_retroactive: boolean;
  earned_at: string;
}

export async function fetchUserPopcorn(userId: string): Promise<PopcornKernel[]> {
  const { data, error } = await supabase
    .from('user_popcorn')
    .select('id, action_type, reference_id, seed, is_milestone, achievement_id, is_retroactive, earned_at')
    .eq('user_id', userId)
    .eq('action_type', 'mark_watched') // bag = movies/shows you actually watched
    .order('earned_at', { ascending: true })
    .limit(500); // render cap — physics perf

  if (error) { Sentry.captureException(error); return []; }
  return data ?? [];
}

export async function fetchPopcornCountsByType(userId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('user_popcorn')
    .select('action_type')
    .eq('user_id', userId);

  if (error) { Sentry.captureException(error); return {}; }

  return (data ?? []).reduce((acc, row) => {
    acc[row.action_type] = (acc[row.action_type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export async function fetchPopcornTotalCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_popcorn')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'mark_watched');

  if (error) { Sentry.captureException(error); return 0; }
  return count ?? 0;
}

export async function runRetroactiveBackfill(userId: string): Promise<void> {
  const { error } = await supabase.rpc('award_popcorn_retroactive', { p_user_id: userId });
  if (error) throw error;
}
