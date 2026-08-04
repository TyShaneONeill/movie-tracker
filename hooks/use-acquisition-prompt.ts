/**
 * Orchestrates the one-time acquisition-source prompt on Home.
 *
 * Runs the gate (lib/acquisition-service.ts) once per mount after the screen
 * settles, and only surfaces the sheet while Home is actually focused — a
 * post-onboarding navigation intent (e.g. the TV Time import handoff) must
 * never get the sheet dropped on top of it. If we lose focus before showing,
 * we simply try again on a later launch; nothing is marked as shown.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import {
  shouldShowAcquisitionPrompt,
  hasAcquisitionPromptBeenShown,
  markAcquisitionPromptShown,
  submitAcquisitionSource,
  dismissAcquisitionPrompt,
  type AcquisitionSource,
} from '@/lib/acquisition-service';

// Let the post-onboarding route handoff (see HomeScreen's
// consumePostOnboardingRoute effect) win the race before we consider showing.
const SHOW_DELAY_MS = 600;

export function useAcquisitionPrompt() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef(false);
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;

  useEffect(() => {
    if (!user?.id || !isFocused || checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    const userId = user.id;

    const run = async () => {
      try {
        if (await hasAcquisitionPromptBeenShown()) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed, created_at, acquisition_source')
          .eq('id', userId)
          .single();
        if (error || !data) {
          // Surface loudly: this branch also fires if the acquisition_source
          // migration is missing on the target DB, which would silently kill
          // attribution for every launch-weekend signup.
          if (error) {
            captureException(new Error(error.message), {
              context: 'acquisition-prompt-profile-read',
            });
          }
          return;
        }

        const eligible = shouldShowAcquisitionPrompt({
          onboardingCompleted: data.onboarding_completed ?? false,
          profileCreatedAt: data.created_at,
          acquisitionSource: data.acquisition_source,
          alreadyShownLocally: false,
        });
        if (!eligible || cancelled) return;

        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            // Re-check at fire time: a handed-off navigation may have taken
            // the user elsewhere since the gate resolved.
            if (cancelled || !focusedRef.current) return;
            void markAcquisitionPromptShown();
            analytics.track('acquisition:prompt_shown');
            setVisible(true);
          }, SHOW_DELAY_MS);
        });
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'acquisition-prompt-gate',
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isFocused]);

  const onSelect = useCallback(
    (source: AcquisitionSource) => {
      setVisible(false);
      if (user?.id) void submitAcquisitionSource(user.id, source);
    },
    [user?.id]
  );

  const onDismiss = useCallback(() => {
    setVisible(false);
    if (user?.id) void dismissAcquisitionPrompt(user.id);
  }, [user?.id]);

  return { visible, onSelect, onDismiss };
}
