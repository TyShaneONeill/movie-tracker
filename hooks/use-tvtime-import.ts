import { useState, useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export const TVTIME_IMPORT_FLAG = 'tvtime_import';

// Dev/QA override — read LITERALLY at module load so Metro inlines it in a prod
// bundle (a dynamic process.env lookup would be undefined). Mirrors the
// EXPO_PUBLIC_*_OVERRIDE pattern used by the other flag gates.
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_TVTIME_IMPORT_OVERRIDE;

export interface TvTimeImportGate {
  /** Whether the import feature is available at all. */
  enabled: boolean;
  /** Whether the Settings entry renders in the pinned "NEW · FOR TV TIME
   *  MEMBERS" section (true, launch default) or demotes to a normal row under
   *  Account (false). Controlled by the flag payload `{ pinned }` so it can be
   *  time-boxed / demoted remotely without an app release. */
  pinned: boolean;
  /** True while PostHog hasn't resolved the flag yet — hold surfaces neutral. */
  resolving: boolean;
}

function readPinned(): boolean {
  const payload = analytics.getFeatureFlagPayload(TVTIME_IMPORT_FLAG);
  if (payload && typeof payload === 'object' && 'pinned' in payload) {
    return (payload as { pinned?: unknown }).pinned !== false;
  }
  // No payload configured → default to pinned (the launch intent).
  return true;
}

/**
 * Resolves availability + placement for the "Import from TV Time" feature.
 *
 * Fails closed: while the flag is still loading (`value === undefined`), the
 * feature is treated as OFF so an unresolved flag never flashes the entry.
 * The env override short-circuits PostHog entirely for dev/QA.
 */
export function useTvTimeImportGate(): TvTimeImportGate {
  const initial = analytics.getFeatureFlag(TVTIME_IMPORT_FLAG);
  const [value, setValue] = useState<string | boolean | undefined>(initial);
  const [resolving, setResolving] = useState<boolean>(
    ENV_OVERRIDE === undefined && initial === undefined
  );

  useEffect(() => {
    if (ENV_OVERRIDE !== undefined) return; // override wins; no polling
    if (!resolving) return;
    const timer = setTimeout(() => {
      setValue(analytics.getFeatureFlag(TVTIME_IMPORT_FLAG));
      setResolving(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resolving]);

  if (ENV_OVERRIDE === 'true') return { enabled: true, pinned: readPinned(), resolving: false };
  if (ENV_OVERRIDE === 'false') return { enabled: false, pinned: false, resolving: false };

  const enabled = value === true || (typeof value === 'string' && value !== 'false');
  return { enabled, pinned: enabled ? readPinned() : false, resolving };
}
