import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { PopcornActionType } from '@/constants/popcorn-types';

export function usePopcornEarn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const earn = useCallback(async (
    actionType: PopcornActionType,
    referenceId?: string
  ) => {
    if (!user) return;
    try {
      const result = await supabase.functions.invoke('earn-popcorn', {
        body: { action_type: actionType, reference_id: referenceId ?? null },
      });

      if (result.data?.earned === true) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ['popcorn', 'count', user.id] });
      queryClient.invalidateQueries({ queryKey: ['popcorn', 'kernels', user.id] });
    } catch {
      // Silent — popcorn earn must never interrupt the user's primary action
    }
  }, [user, queryClient]);

  return { earn };
}
