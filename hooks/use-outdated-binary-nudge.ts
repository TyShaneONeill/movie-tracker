import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { analytics } from '@/lib/analytics';
import {
  VERSION_NUDGE_FLAG,
  DEFAULT_SNOOZE_DAYS,
  parseNudgeConfig,
  resolveNudgeTier,
  isNudgeSnoozed,
  getNudgeSnooze,
  recordNudgeSnooze,
  openStoreListing,
  envOverrideTier,
  type NudgeConfig,
  type NudgeSnooze,
  type NudgeTier,
} from '@/lib/app-version-nudge';

export interface OutdatedBinaryNudge {
  tier: NudgeTier;
  /** The store version we're pointing at, for copy and analytics. */
  targetVersion: string | null;
  /** Only the 'recommended' tier is dismissible. */
  onDismiss: () => void;
  onUpdate: () => void;
}

const HIDDEN: Omit<OutdatedBinaryNudge, 'onDismiss' | 'onUpdate'> = {
  tier: 'none',
  targetVersion: null,
};

/**
 * Drives the outdated-binary banner on Home (#726). Resolves the PostHog flag
 * `outdated_binary_nudge` + its payload against the binary's native
 * `Updates.runtimeVersion`, then applies the snooze policy.
 *
 * Fails quiet in every failure mode: flag off or still loading, no payload,
 * unparseable versions, web, or unreadable storage all resolve to 'none' with
 * no banner, no crash, and at most one Sentry message per session (raised in
 * parseNudgeConfig, not here).
 */
export function useOutdatedBinaryNudge(): OutdatedBinaryNudge {
  const override = envOverrideTier();
  const [config, setConfig] = useState<NudgeConfig | null>(() =>
    analytics.getFeatureFlag(VERSION_NUDGE_FLAG)
      ? parseNudgeConfig(analytics.getFeatureFlagPayload(VERSION_NUDGE_FLAG))
      : null
  );
  // `undefined` = not read yet, and fails closed in isNudgeSnoozed.
  const [snooze, setSnooze] = useState<NudgeSnooze | null | undefined>(undefined);
  const shownRef = useRef(false);

  useEffect(() => {
    if (override !== null) return; // override wins; don't consult PostHog
    // Flags usually aren't resolved on the very first render, so re-read once
    // PostHog reports them ready rather than guessing at a timeout.
    return analytics.onFeatureFlags(() => {
      setConfig(
        analytics.getFeatureFlag(VERSION_NUDGE_FLAG)
          ? parseNudgeConfig(analytics.getFeatureFlagPayload(VERSION_NUDGE_FLAG))
          : null
      );
    });
  }, [override]);

  useEffect(() => {
    let cancelled = false;
    getNudgeSnooze().then((stored) => {
      if (!cancelled) setSnooze(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentVersion = Updates.runtimeVersion ?? null;
  const resolvedTier = override ?? resolveNudgeTier(currentVersion, config);
  const targetVersion =
    resolvedTier === 'minimum' ? config?.minimum ?? null : config?.recommended ?? null;

  // The minimum tier is never snoozable — it's the lever for a binary that is
  // actually broken, so it stays until the user updates.
  const suppressed =
    resolvedTier === 'recommended' &&
    isNudgeSnoozed(snooze, config?.recommended ?? null, config?.snoozeDays ?? DEFAULT_SNOOZE_DAYS);

  const tier: NudgeTier = suppressed ? 'none' : resolvedTier;

  useEffect(() => {
    if (tier === 'none' || shownRef.current) return;
    shownRef.current = true;
    analytics.track('version_nudge_shown', {
      tier,
      current_version: currentVersion,
      target_version: targetVersion,
    });
  }, [tier, currentVersion, targetVersion]);

  const onDismiss = useCallback(() => {
    const version = config?.recommended;
    if (!version) return;
    analytics.track('version_nudge_dismissed', { target_version: version });
    // Hide immediately; persistence catches up behind the AsyncStorage round
    // trip, matching the TV Time banner's optimistic dismissal.
    setSnooze({ version, snoozedAt: Date.now() });
    void recordNudgeSnooze(version).then(setSnooze);
  }, [config?.recommended]);

  const onUpdate = useCallback(() => {
    analytics.track('version_nudge_tapped', {
      tier,
      current_version: currentVersion,
      target_version: targetVersion,
    });
    openStoreListing();
  }, [tier, currentVersion, targetVersion]);

  if (tier === 'none') return { ...HIDDEN, onDismiss, onUpdate };
  return { tier, targetVersion, onDismiss, onUpdate };
}
