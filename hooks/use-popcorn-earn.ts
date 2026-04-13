import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
      await supabase.functions.invoke('earn-popcorn', {
        body: { action_type: actionType, reference_id: referenceId ?? null },
      });
      queryClient.invalidateQueries({ queryKey: ['popcorn', 'count', user.id] });
    } catch {
      // Silent — popcorn earn must never interrupt the user's primary action
    }
  }, [user, queryClient]);

  return { earn };
}
