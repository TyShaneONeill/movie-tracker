/**
 * Orchestrates the one-time acquisition-source prompt on Home.
 *
 * Runs the gate (lib/acquisition-service.ts) once the flag has actually
 * RESOLVED, and only surfaces the sheet while Home is focused — a
 * post-onboarding navigation intent (e.g. the TV Time import handoff) must
 * never get the sheet dropped on top of it. If we lose focus before showing,
 * we try again on the next focus or launch; nothing is marked as shown.
 *
 * Once the gate actually RUNS, a launch that does not get the prompt reports
 * why via `acquisition:gate_evaluated`, so a dark prompt is one event away from
 * a diagnosis instead of an inference from `$feature_flag_called` volume. Three
 * cases deliberately emit nothing, and their silence is itself the signal:
 * signed out or Home never focused (the gate never ran), the flag still pending
 * (we are waiting, not refusing), and a failed profile read (that path raises
 * to Sentry instead — a broken DB is not a gating decision).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import { useAcquisitionPromptGate } from '@/hooks/use-feature-flag';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import {
  evaluateAcquisitionPrompt,
  hasAcquisitionPromptBeenShown,
  markAcquisitionPromptShown,
  submitAcquisitionSource,
  dismissAcquisitionPrompt,
  type AcquisitionGateReason,
  type AcquisitionSource,
} from '@/lib/acquisition-service';

// Let the post-onboarding route handoff (see HomeScreen's
// consumePostOnboardingRoute effect) win the race before we consider showing.
const SHOW_DELAY_MS = 600;

/**
 * One `gate_evaluated` event per reason per app session. The gate re-evaluates
 * on every Home re-focus, so this keeps the diagnostic signal (which reason)
 * without turning it into a per-render firehose.
 */
const reportedReasons = new Set<AcquisitionGateReason>();

function reportGate(reason: AcquisitionGateReason): void {
  if (reportedReasons.has(reason)) return;
  reportedReasons.add(reason);
  analytics.track('acquisition:gate_evaluated', { reason });
}

/** Session-scoped dedupe of the above; tests need a clean slate per case. */
export function __resetAcquisitionGateTelemetryForTests(): void {
  reportedReasons.clear();
}

export function useAcquisitionPrompt() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  // Founder-first rollout gate (PostHog `acquisition_prompt`). `resolved`
  // separates "flag is off" from "flag has not loaded yet" — the latter is the
  // normal state of the very first session this prompt exists for.
  const {
    enabled: flagEnabled,
    resolved: flagResolved,
    resolution: flagResolution,
  } = useAcquisitionPromptGate();
  const [visible, setVisible] = useState(false);
  // In-flight guard only. Deliberately NOT a once-per-mount latch: an
  // evaluation that ended in `lost_focus` must get another chance when Home
  // regains focus.
  const inFlightRef = useRef(false);
  const openRef = useRef(false);
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;

  useEffect(() => {
    // Wait for a real answer rather than spending the evaluation on an
    // unresolved flag; the backstop inside the gate guarantees this ends.
    if (!flagResolved || !user?.id || !isFocused) return;
    if (!flagEnabled) {
      // A backstop resolution means PostHog never answered, so `enabled: false`
      // is UNKNOWN, not off. Reporting flag_off here would lie in exactly the
      // scenario this event exists to diagnose — the offline first launch.
      reportGate(flagResolution === 'backstop' ? 'flag_unresolved' : 'flag_off');
      return;
    }
    if (inFlightRef.current || openRef.current) return;
    inFlightRef.current = true;

    let cancelled = false;
    const userId = user.id;

    const run = async () => {
      try {
        if (await hasAcquisitionPromptBeenShown()) {
          reportGate('already_shown');
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed, created_at, acquisition_source, account_tier')
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

        const { eligible, reason } = evaluateAcquisitionPrompt({
          onboardingCompleted: data.onboarding_completed ?? false,
          profileCreatedAt: data.created_at,
          acquisitionSource: data.acquisition_source,
          accountTier: data.account_tier,
        });
        if (!eligible) {
          if (reason) reportGate(reason);
          return;
        }
        if (cancelled) return;

        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            // Re-check at fire time: a handed-off navigation may have taken
            // the user elsewhere since the gate resolved.
            if (!focusedRef.current) {
              reportGate('lost_focus');
              return;
            }
            if (cancelled) return;
            openRef.current = true;
            analytics.track('acquisition:prompt_shown');
            setVisible(true);
          }, SHOW_DELAY_MS);
        });
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'acquisition-prompt-gate',
        });
      } finally {
        inFlightRef.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [flagEnabled, flagResolved, user?.id, isFocused]);

  /**
   * The user answered. The local once-ever latch is written HERE, not at show
   * time: an impression nobody answered (app backgrounded, force-quit, sheet
   * never seen) must not burn the single ask we get.
   *
   * Accepted trade: force-quitting while the sheet is up means we ask once more
   * next launch. `profiles.acquisition_source` is still the durable once-ever
   * guard server-side, so a user who actually answered is never re-asked.
   */
  const onSelect = useCallback(
    (source: AcquisitionSource) => {
      void markAcquisitionPromptShown();
      if (user?.id) void submitAcquisitionSource(user.id, source);
    },
    [user?.id]
  );

  /** Sheet leaves after the thank-you beat; the answer is already persisted. */
  const onClose = useCallback(() => {
    openRef.current = false;
    setVisible(false);
  }, []);

  const onDismiss = useCallback(() => {
    openRef.current = false;
    setVisible(false);
    void markAcquisitionPromptShown();
    if (user?.id) void dismissAcquisitionPrompt(user.id);
  }, [user?.id]);

  return { visible, onSelect, onClose, onDismiss };
}
