import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useSegments } from 'expo-router';

import { analytics } from '@/lib/analytics';

// Fire `app:session_start` at most once per this gap, so background / widget /
// push wakes within an already-active session don't inflate the count — that
// is exactly the failure mode of the SDK's auto `Application Opened` event,
// which we are NOT using as the active-user signal. 30 min is the conventional
// session gap.
const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * Canonical cross-platform "active session" signal.
 *
 * Fires `app:session_start` on cold start and on a real foreground resume after
 * the session gap. This is the clean MAU/DAU event — unlike `Application Opened`
 * it does not fire on background/widget/push wakes, and unlike `$pageview` it is
 * not polluted by anonymous SEO traffic. Phase 3 switches the Discord digest +
 * dashboards to count this event.
 */
export function useSessionTracking() {
  const lastStart = useRef(0);

  useEffect(() => {
    const fire = (trigger: 'launch' | 'foreground') => {
      const now = Date.now();
      if (now - lastStart.current < SESSION_GAP_MS) return;
      lastStart.current = now;
      analytics.track('app:session_start', { platform: Platform.OS, trigger });
    };

    // Cold start (covers web page load too).
    fire('launch');

    if (Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') fire('foreground');
    });
    return () => sub.remove();
  }, []);
}

/**
 * Manual `$screen` capture for mobile. PostHog's RN auto screen-capture is inert
 * under expo-router (it doesn't expose the NavigationContainer), which is why
 * `$screen` had zero events. Web is unaffected — it auto-captures `$pageview`.
 *
 * Uses `useSegments()` (the file-route pattern, e.g. `movie/[id]`) rather than
 * the resolved pathname so screen names stay low-cardinality.
 */
export function useScreenTracking() {
  const segments = useSegments();
  const name = '/' + (segments as string[]).join('/');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    analytics.screen(name);
  }, [name]);
}
