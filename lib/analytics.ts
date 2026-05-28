import { Platform } from 'react-native';
import { getAnalyticsEnabled } from './privacy-preferences';

// posthog-react-native is NOT statically imported — doing so runs module-level native
// initialization code that can crash on iOS 26.4 beta. Loaded lazily inside initAnalytics.

type EventProperties = Record<string, string | number | boolean | null | undefined>;
type UserProperties = Record<string, string | number | boolean | null | undefined>;

// `any` is unavoidable here — posthog-js and posthog-react-native expose
// different (incompatible) types but we abstract over both at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let posthogClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nativeClient: any | null = null;

/** Initialize the analytics client */
export async function initAnalytics(apiKey: string, host: string) {
  if (!apiKey) return;

  if (Platform.OS === 'web') {
    try {
      const posthog = await import('posthog-js');
      posthog.default.init(apiKey, {
        api_host: '/ingest',
        ui_host: host,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage',
        autocapture: false, // We'll track events explicitly for a clean taxonomy
        respect_dnt: true,
      });
      posthogClient = posthog.default;
    } catch (error) {
      console.warn('[analytics] Failed to initialize PostHog (web):', error);
    }
  } else {
    try {
      // Dynamic import prevents posthog-react-native module-level native initialization
      // from running at bundle load time (same iOS 26.4 beta crash pattern as GMA/RevenueCat).
      const { default: PostHogNative } = await import('posthog-react-native');
      nativeClient = new PostHogNative(apiKey, {
        host,
        captureAppLifecycleEvents: true,
        enableSessionReplay: false,
      });
      posthogClient = nativeClient;
    } catch (error) {
      console.warn('[analytics] Failed to initialize PostHog (native):', error);
    }
  }

  // Apply the user's previous opt-out choice. PostHog's opt_out_capturing()
  // (web) / optOut() (RN) is persisted by the SDK, but we still re-apply on
  // boot in case storage was cleared or the SDK was re-initialized.
  try {
    const enabled = await getAnalyticsEnabled();
    if (!enabled) {
      applyAnalyticsEnabled(false);
    }
  } catch {
    // Default-on behavior: do nothing.
  }
}

/**
 * Toggle PostHog event capture at runtime.
 *
 * Uses PostHog's official opt-out API:
 *   - Native: `optIn()` / `optOut()`
 *   - Web:    `opt_in_capturing()` / `opt_out_capturing()`
 *
 * In-flight events queued before opt-out are dropped by the SDK — that's the
 * documented behavior of these APIs.
 */
export function applyAnalyticsEnabled(enabled: boolean) {
  if (!posthogClient) return;

  if (Platform.OS === 'web') {
    if (enabled) {
      posthogClient.opt_in_capturing?.();
    } else {
      posthogClient.opt_out_capturing?.();
    }
    return;
  }

  if (enabled) {
    posthogClient.optIn?.();
  } else {
    posthogClient.optOut?.();
  }
}

/** Shut down the analytics client */
export function shutdownAnalytics() {
  if (nativeClient) {
    nativeClient.flush().catch(() => {});
    nativeClient.shutdown();
    nativeClient = null;
  }
  posthogClient = null;
}

export const analytics = {
  /** Track a named event with optional properties */
  track(event: string, properties?: EventProperties) {
    posthogClient?.capture(event, properties);
  },

  /** Identify a user after sign-in */
  identify(userId: string, properties?: UserProperties) {
    posthogClient?.identify(userId, properties);
  },

  /** Reset identity on sign-out */
  reset() {
    posthogClient?.reset();
  },

  /** Check if a feature flag is enabled */
  isFeatureEnabled(flagName: string): boolean {
    return posthogClient?.isFeatureEnabled(flagName) ?? false;
  },

  /** Get a feature flag value (for multivariate flags) */
  getFeatureFlag(flagName: string): string | boolean | undefined {
    return posthogClient?.getFeatureFlag(flagName);
  },

  /** Reload feature flags from PostHog */
  reloadFeatureFlags() {
    posthogClient?.reloadFeatureFlags();
  },

  /** Set user properties without tracking an event */
  setPersonProperties(properties: UserProperties) {
    posthogClient?.setPersonProperties(properties);
  },
};
