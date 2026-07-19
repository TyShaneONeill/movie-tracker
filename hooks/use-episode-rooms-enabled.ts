import { useEffect, useState } from 'react';
import { analytics } from '@/lib/analytics';
import { useFeatureFlag } from './use-feature-flag';

const FLAG = 'episode_rooms';

/** The `EXPO_PUBLIC_*` dev override, or null when unset. Metro inlines the
 *  literal member access, so this must stay a direct `process.env.X` read. */
function episodeRoomsOverride(): boolean | null {
  const envOverride = process.env.EXPO_PUBLIC_EPISODE_ROOMS_OVERRIDE;
  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return null;
}

function flagValueEnabled(): boolean {
  const value = analytics.getFeatureFlag(FLAG);
  return value === true || (typeof value === 'string' && value !== 'false');
}

/**
 * Non-reactive read for imperative call sites that can't use a hook — chiefly
 * the push-tap handler (push-notification-service). Same override→flag decision
 * as the hook, defaulting OFF when the flag is missing/unresolved.
 */
export function episodeRoomsEnabled(): boolean {
  const override = episodeRoomsOverride();
  if (override !== null) return override;
  return flagValueEnabled();
}

/**
 * Episode Rooms (per-episode discussion) master gate. Defaults OFF whenever the
 * `episode_rooms` PostHog flag is missing or unresolved. Mirrors
 * `useStreakSpineEnabled`: an `EXPO_PUBLIC_*` literal override wins so the
 * feature can be forced on/off for local device iteration without touching
 * PostHog. Every Episode Room entry point (row affordance, post-watch nudge)
 * consults this hook.
 */
export function useEpisodeRoomsEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag(FLAG);
  const override = episodeRoomsOverride();

  if (override !== null) return override;
  return flagOn;
}

/**
 * Like `useEpisodeRoomsEnabled`, but also reports whether the flag state is
 * RESOLVED — i.e. PostHog has actually loaded flags (or an env override / an
 * already-cached flag makes the answer certain). The room route uses `resolved`
 * to decide when a flag-off redirect is safe, so a flag-ON user is never
 * falsely bounced on a cold start where flags resolve slowly. A backstop
 * timeout guarantees `resolved` eventually flips even if PostHog never answers
 * (offline / init failure), so the screen can't hang forever.
 */
export function useEpisodeRoomsGate(backstopMs = 5000): {
  enabled: boolean;
  resolved: boolean;
} {
  const override = episodeRoomsOverride();

  // `enabled` is read at the SAME moment `resolved` flips (from one
  // getFeatureFlag read), so the two can never disagree — this is why the gate
  // computes `enabled` itself instead of reusing useEpisodeRoomsEnabled, whose
  // value lags behind flag resolution on its own fixed re-check timer and would
  // otherwise let a resolved+enabled flag briefly read as resolved+disabled.
  const [state, setState] = useState<{ enabled: boolean; resolved: boolean }>(() => {
    if (override !== null) return { enabled: override, resolved: true };
    return {
      enabled: flagValueEnabled(),
      resolved: analytics.getFeatureFlag(FLAG) !== undefined,
    };
  });

  useEffect(() => {
    if (override !== null || state.resolved) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // Re-read the flag now that PostHog has answered (or the backstop fired,
      // in which case it fails closed to whatever is cached — typically false).
      setState({ enabled: flagValueEnabled(), resolved: true });
    };

    // Fires when PostHog resolves flags (and on later refreshes).
    const unsubscribe = analytics.onFeatureFlags(finish);
    // Guard the race where flags landed between render and subscribe.
    if (analytics.getFeatureFlag(FLAG) !== undefined) finish();
    // Never hang if PostHog never answers (offline / init failure).
    const backstop = setTimeout(finish, backstopMs);

    return () => {
      unsubscribe();
      clearTimeout(backstop);
    };
  }, [override, state.resolved, backstopMs]);

  return state;
}
