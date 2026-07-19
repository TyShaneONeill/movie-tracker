import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import type { FirstTake } from '@/lib/database.types';

/** Author identity shown on a room take's fine-print footer. */
export interface RoomAuthor {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  updatedAt: string | null;
}

export interface EpisodeRoomTake {
  take: FirstTake;
  author: RoomAuthor | null;
}

/**
 * HARD watched-gate probe (Decision, Ty 2026-07-19 — no peek). Resolves whether
 * the signed-in user has ANY watch row for this exact episode. The room must not
 * fetch a single take until this is true, so no spoiler content ever lands in
 * memory for an unwatched episode. A HEAD count is used because rewatches create
 * multiple rows (watch_number 2+) — any row means "watched".
 */
export function useEpisodeWatched(tmdbId: number, season: number, episode: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode-room-watched', user?.id, tmdbId, season, episode],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('user_episode_watches')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('tmdb_show_id', tmdbId)
        .eq('season_number', season)
        .eq('episode_number', episode);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!user?.id && tmdbId > 0,
    staleTime: 60 * 1000,
  });
}

/**
 * Whether the signed-in user ALREADY has a take for this exact episode — across
 * every visibility, not just the public room stream. The room hides its compose
 * affordances when true, so a user with an existing (possibly non-public) take
 * can't be handed a blank composer that would dead-end on the
 * `idx_first_takes_unique_tv_episode` unique violation. `maybeSingle` is safe:
 * that index guarantees at most one row per (user, tmdb, season, episode).
 */
export function useUserEpisodeTake(tmdbId: number, season: number, episode: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode-room-own-take', user?.id, tmdbId, season, episode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('first_takes')
        .select('id')
        .eq('user_id', user!.id)
        .eq('tmdb_id', tmdbId)
        .eq('season_number', season)
        .eq('episode_number', episode)
        .eq('media_type', 'tv_episode')
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user?.id && tmdbId > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * The room's take stream: every public first take scoped to this exact episode,
 * newest-first, each paired with its author profile. `enabled` MUST be the
 * resolved watched-gate result — the caller never turns this on for an unwatched
 * viewer.
 *
 * Authors are batch-fetched by id (the get-comments pattern) rather than an
 * embedded FK join so the query doesn't depend on a named constraint. Blocked
 * users are filtered client-side because SELECT RLS ignores blocks — the
 * standing rule for every NEW content stream (mirrors use-prioritized-feed).
 */
export function useEpisodeRoomTakes(
  tmdbId: number,
  season: number,
  episode: number,
  enabled: boolean
) {
  const { blockedIds } = useBlockedUsers();

  const query = useQuery({
    queryKey: ['episode-room-takes', tmdbId, season, episode],
    queryFn: async (): Promise<EpisodeRoomTake[]> => {
      const { data: takes, error } = await supabase
        .from('first_takes')
        .select('*')
        .eq('tmdb_id', tmdbId)
        .eq('season_number', season)
        .eq('episode_number', episode)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (takes ?? []) as FirstTake[];
      if (rows.length === 0) return [];

      const userIds = [...new Set(rows.map((t) => t.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, updated_at')
        .in('id', userIds);
      if (profilesError) throw profilesError;

      const byId = new Map<string, RoomAuthor>();
      for (const p of profiles ?? []) {
        byId.set(p.id, {
          id: p.id,
          fullName: p.full_name,
          username: p.username,
          avatarUrl: p.avatar_url,
          updatedAt: p.updated_at,
        });
      }

      return rows.map((take) => ({ take, author: byId.get(take.user_id) ?? null }));
    },
    enabled: enabled && tmdbId > 0,
  });

  const takes = useMemo(
    () => (query.data ?? []).filter((row) => !blockedIds.includes(row.take.user_id)),
    [query.data, blockedIds]
  );

  return {
    takes,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
