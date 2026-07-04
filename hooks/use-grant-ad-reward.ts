import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { clearPendingAiCredit } from '@/lib/pending-ai-credit';

interface GrantAdRewardResponse {
  success: boolean;
  creditsRemaining?: number;
  error?: string;
}

const MAX_GRANT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useGrantAdReward() {
  const [isGranting, setIsGranting] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  /**
   * Grant one AI credit for a watched rewarded ad. Retries transient failures
   * (e.g. FunctionsFetchError when the network is briefly unavailable right
   * after the ad closes — issue #592) up to MAX_GRANT_ATTEMPTS. Clears the
   * durable pending-credit marker ONLY on a confirmed success. If it never
   * succeeds (e.g. the whole flow was offline), the marker stays and the
   * app-global `useAiCreditRecovery` redeems it on reconnect/foreground.
   */
  const grantCredit = useCallback(async (): Promise<boolean> => {
    setIsGranting(true);
    try {
      for (let attempt = 1; attempt <= MAX_GRANT_ATTEMPTS; attempt++) {
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !sessionData.session) {
            throw new Error('Not authenticated');
          }

          const { data, error } = await supabase.functions.invoke<GrantAdRewardResponse>(
            'grant-ad-reward',
            {
              body: {},
              headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
            }
          );

          if (error) {
            // Transport/network failure — retry.
            throw error;
          }
          if (!data?.success) {
            // Definitive server rejection — do NOT retry, but keep the pending
            // marker so a later resume can try again with a fresh session.
            console.error('[GrantAdReward] Server rejected grant:', data?.error);
            return false;
          }

          await clearPendingAiCredit();
          await Promise.all([
            queryClient.refetchQueries({ queryKey: ['ai-trial-used', user?.id] }),
            queryClient.refetchQueries({ queryKey: ['ad-credits', user?.id] }),
          ]);
          return true;
        } catch (err) {
          if (attempt === MAX_GRANT_ATTEMPTS) {
            console.error('[GrantAdReward] Grant failed after retries:', err);
            return false;
          }
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
      return false;
    } finally {
      setIsGranting(false);
    }
  }, [queryClient, user?.id]);

  return { grantCredit, isGranting };
}
