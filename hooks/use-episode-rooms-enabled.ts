import { useFeatureFlag } from './use-feature-flag';

/**
 * Episode Rooms (per-episode discussion) master gate. Defaults OFF whenever the
 * `episode_rooms` PostHog flag is missing or unresolved. Mirrors
 * `useStreakSpineEnabled`: an `EXPO_PUBLIC_*` literal override wins so the
 * feature can be forced on/off for local device iteration without touching
 * PostHog. Every Episode Room entry point (row affordance, post-watch nudge)
 * and the room route itself consults this hook.
 */
export function useEpisodeRoomsEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('episode_rooms');
  const envOverride = process.env.EXPO_PUBLIC_EPISODE_ROOMS_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}
