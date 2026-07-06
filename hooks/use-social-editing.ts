import { useFeatureFlag } from './use-feature-flag';

/** PostHog feature flag that gates PS-12 social editing (edit posts + comments). */
export const SOCIAL_EDITING_FLAG = 'social_editing';

/**
 * True when the `social_editing` PostHog flag is ON.
 *
 * Gates every EDIT affordance across the app (review edit, First Take pencil,
 * comment Edit action). When OFF the app behaves as if editing doesn't exist.
 * The "Edited" provenance badge is NOT gated by this — it is just historical
 * metadata and shows wherever an already-edited post appears.
 *
 * Wraps the generic {@link useFeatureFlag} hook, mirroring how `stats_v2` /
 * `onboarding_v2` are read.
 */
export function useSocialEditingEnabled(): boolean {
  return useFeatureFlag(SOCIAL_EDITING_FLAG).enabled;
}
