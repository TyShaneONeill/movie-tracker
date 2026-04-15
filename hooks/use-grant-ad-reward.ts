import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

interface GrantAdRewardResponse {
  success: boolean;
  creditsRemaining?: number;
  error?: string;
}

export function useGrantAdReward() {
  const [isGranting, setIsGranting] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const grantCredit = async (): Promise<boolean> => {
    setIsGranting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke<GrantAdRewardResponse>(
        'grant-ad-reward',
        {
          body: {},
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      if (error || !data?.success) {
        console.error('[GrantAdReward] Failed:', error);
        return false;
      }

      queryClient.invalidateQueries({ queryKey: ['ai-trial-used', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['ad-credits', user?.id] });

      return true;
    } catch (err) {
      console.error('[GrantAdReward] Error:', err);
      return false;
    } finally {
      setIsGranting(false);
    }
  };

  return { grantCredit, isGranting };
}
