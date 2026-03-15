import { Platform } from 'react-native';

type EventProperties = Record<string, string | number | boolean | null | undefined>;
type UserProperties = Record<string, string | number | boolean | null | undefined>;

let posthogClient: any = null;

/** Initialize the analytics client (web only for now) */
export async function initAnalytics(apiKey: string, host: string) {
  if (Platform.OS !== 'web' || !apiKey) return;

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
    console.warn('[analytics] Failed to initialize PostHog:', error);
  }
}

/** Shut down the analytics client */
export function shutdownAnalytics() {
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
