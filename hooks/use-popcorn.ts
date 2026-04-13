import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth-context';
import {
  fetchUserPopcorn,
  fetchPopcornCountsByType,
  fetchPopcornTotalCount,
  runRetroactiveBackfill,
} from '@/lib/popcorn-service';

export function usePopcorn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const kernelsQuery = useQuery({
    queryKey: ['popcorn', 'kernels', user?.id],
    queryFn: () => fetchUserPopcorn(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const countQuery = useQuery({
    queryKey: ['popcorn', 'count', user?.id],
    queryFn: () => fetchPopcornTotalCount(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60,
  });

  const countsByTypeQuery = useQuery({
    queryKey: ['popcorn', 'countsByType', user?.id],
    queryFn: () => fetchPopcornCountsByType(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!user) return;
    const key = `popcorn_backfill_done_${user.id}`;
    AsyncStorage.getItem(key).then((done) => {
      if (!done) {
        runRetroactiveBackfill(user.id).then(() => {
          AsyncStorage.setItem(key, '1');
          queryClient.invalidateQueries({ queryKey: ['popcorn', 'count', user.id] });
          queryClient.invalidateQueries({ queryKey: ['popcorn', 'kernels', user.id] });
        });
      }
    });
  }, [user?.id]);

  return {
    kernels: kernelsQuery.data ?? [],
    totalCount: countQuery.data ?? 0,
    countsByType: countsByTypeQuery.data ?? {},
    isLoading: kernelsQuery.isLoading,
  };
}
