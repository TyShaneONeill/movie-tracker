import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { AvatarConfig, AvatarType } from '@/lib/avatar-config';

/**
 * Centralized avatar customization lookup.
 *
 * Customized vector/initial avatars live on `profiles.avatar_type/avatar_config`,
 * but most render sites (feed, comments, social lists, reviews) only carry a
 * user id + photo url — not the config. Rather than thread two columns through
 * ~10 bespoke DTOs, we fetch the (small) set of users who have customized once
 * and cache it app-wide; `<Avatar>` looks itself up by user id.
 *
 * Scope note: this fetches ALL customized profiles in one query. That's ideal
 * while the customized-user set is small. At scale, switch to a viewport-scoped
 * fetch (by the ids actually on screen) or thread the columns through the feed/
 * comment/list queries instead.
 */
export interface AvatarOverride {
  avatarType: AvatarType;
  avatarConfig: AvatarConfig | null;
}

export const AVATAR_OVERRIDES_QUERY_KEY = ['avatar-overrides'] as const;

async function fetchAvatarOverrides(): Promise<Record<string, AvatarOverride>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, avatar_type, avatar_config')
    .in('avatar_type', ['preset', 'initial']);

  if (error) throw error;

  const map: Record<string, AvatarOverride> = {};
  for (const row of (data ?? []) as { id: string; avatar_type: AvatarType; avatar_config: AvatarConfig | null }[]) {
    map[row.id] = { avatarType: row.avatar_type, avatarConfig: row.avatar_config ?? null };
  }
  return map;
}

export function useAvatarOverrides(enabled = true) {
  return useQuery({
    queryKey: AVATAR_OVERRIDES_QUERY_KEY,
    queryFn: fetchAvatarOverrides,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
