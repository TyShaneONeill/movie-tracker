import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { clearPendingAiCredit, getPendingAiCredit } from '@/lib/pending-ai-credit';

/**
 * App-global recovery for a rewarded-ad AI credit that was earned but never
 * granted (issue #592/#599) — e.g. the user watched the ad offline, or the app
 * was killed before the grant landed.
 *
 * Mounted ONCE at the root (not in the generate component), and redeems on:
 *  - app launch / this hook mounting,
 *  - every foreground transition (AppState → active),
 *  - and network reconnect (NetInfo → isConnected) — the key case a wifi/LTE
 *    toggle wouldn't otherwise trigger, since the app never leaves foreground.
 *
 * The credit is consumed ONLY on a confirmed server grant; failures leave the
 * marker for the next trigger. A single in-flight lock prevents double-grants
 * when several triggers fire together.
 */
export function useAiCreditRecovery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const redeemingRef = useRef(false);

  const redeem = useCallback(async () => {
    if (redeemingRef.current || !user) return;

    const pending = await getPendingAiCredit();
    if (!pending) return;

    redeemingRef.current = true;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return; // not authed yet — a later trigger retries

      const { data, error } = await supabase.functions.invoke<{ success: boolean }>(
        'grant-ad-reward',
        { body: {}, headers: { Authorization: `Bearer ${token}` } }
      );

      if (error || !data?.success) return; // keep the marker; retry on next trigger

      await clearPendingAiCredit();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['ai-trial-used', user.id] }),
        queryClient.refetchQueries({ queryKey: ['ad-credits', user.id] }),
      ]);
    } catch {
      // offline / transient — marker stays, a later trigger redeems it
    } finally {
      redeemingRef.current = false;
    }
  }, [user, queryClient]);

  useEffect(() => {
    void redeem();

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void redeem();
    });

    const netInfoUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) void redeem();
    });

    return () => {
      appStateSub.remove();
      netInfoUnsub();
    };
  }, [redeem]);
}
