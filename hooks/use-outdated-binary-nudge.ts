import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { analytics } from '@/lib/analytics';
import {
  VERSION_NUDGE_FLAG,
  DEFAULT_SNOOZE_DAYS,
  parseNudgeConfig,
  reportNudgeConfigProblem,
  resolveNudgeTier,
  isNudgeSnoozed,
  getNudgeSnooze,
  recordNudgeSnooze,
  openStoreListing,
  envOverrideTier,
  type NudgeConfig,
  type NudgeConfigResult,
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

const NO_CONFIG: NudgeConfigResult = { config: null, problem: null };

/**
 * Stand-in config for the dev/QA override, used only when PostHog has no
 * usable payload. Without it the override could render the card but not
 * exercise dismissal (which needs a `recommended` to key the snooze on), so
 * the one path QA most needs to walk would be dead.
 */
const OVERRIDE_CONFIG: NudgeConfig = {
  recommended: 'override',
  minimum: null,
  snoozeDays: DEFAULT_SNOOZE_DAYS,
};

/**
 * Reads the flag and its payload behind a try/catch. This is the only
 * third-party boundary the nudge crosses, it runs during Home's render, and
 * it runs on a cohort we cannot patch — so a throw from the PostHog client
 * must degrade to "no banner", never to a broken home screen.
 */
function readConfig(): NudgeConfigResult {
  try {
    const value = analytics.getFeatureFlag(VERSION_NUDGE_FLAG);
    // Same shape as the sibling flag gates: an unresolved flag is falsy, and a
    // string payload counts as on unless it's literally 'false'.
    const enabled = value === true || (typeof value === 'string' && value !== 'false');
    if (!enabled) return NO_CONFIG;
    return parseNudgeConfig(analytics.getFeatureFlagPayload(VERSION_NUDGE_FLAG));
  } catch {
    return NO_CONFIG;
  }
}

/**
 * Drives the outdated-binary banner on Home (#726). Resolves the PostHog flag
 * `outdated_binary_nudge` + its payload against the binary's native
 * `Updates.runtimeVersion`, then applies the snooze policy.
 *
 * Fails quiet in every failure mode: flag off or still loading, no payload, a
 * throwing PostHog client, unparseable versions, web, or unreadable storage
 * all resolve to 'none' with no banner and no crash — and at most one Sentry
 * message per session, raised from an effect.
 */
export function useOutdatedBinaryNudge(): OutdatedBinaryNudge {
  const override = envOverrideTier();
  const [result, setResult] = useState<NudgeConfigResult>(() =>
    override !== null ? NO_CONFIG : readConfig()
  );
  // `undefined` = not read yet, and fails closed in isNudgeSnoozed.
  const [snooze, setSnooze] = useState<NudgeSnooze | null | undefined>(undefined);
  const shownRef = useRef(false);

  useEffect(() => {
    if (override !== null) return; // override wins; don't consult PostHog
    // Flags usually aren't resolved on the very first render, so re-read once
    // PostHog reports them ready rather than guessing at a timeout.
    try {
      return analytics.onFeatureFlags(() => setResult(readConfig()));
    } catch {
      return;
    }
  }, [override]);

  const problem = result.problem;
  useEffect(() => {
    if (problem) reportNudgeConfigProblem(problem);
  }, [problem]);

  useEffect(() => {
    let cancelled = false;
    getNudgeSnooze().then((stored) => {
      if (!cancelled) setSnooze(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const config = override !== null ? result.config ?? OVERRIDE_CONFIG : result.config;
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

  if (tier === 'none') return { tier: 'none', targetVersion: null, onDismiss, onUpdate };
  return { tier, targetVersion, onDismiss, onUpdate };
}
