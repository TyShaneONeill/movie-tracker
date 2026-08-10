// Fires a router.replace deferred to the next frame, but re-validates that the
// route group which justified the redirect is still current before firing.
//
// Why this exists: the protected-route guard effect (app/_layout.tsx) schedules
// this via requestAnimationFrame to ensure the navigator has mounted (see the
// crash-safety note on the retry loop below). But a RAF can land 100s of ms
// later, after the user has already navigated elsewhere (e.g. the onboarding
// "Import from TV Time" CTA handing off to /settings/tvtime-import). Firing a
// stale router.replace at that point stomps the user back to whatever route the
// guard decided on when it was scheduled. Bug: PS onboarding-import-cta.
//
// Extracted as a standalone module (no React/expo-router imports) so it can be
// unit tested without pulling in app/_layout.tsx's full provider tree.
export type GuardedNavigationDeps = {
  /** Reads the CURRENT top-level route group (segments[0]) at RAF-fire time — must read live state, not a stale closure. */
  getCurrentGroup: () => string | undefined;
  /** Performs the actual navigation, e.g. router.replace. */
  navigate: (route: string) => void;
  /**
   * Schedules a callback for the next frame, e.g. requestAnimationFrame.
   *
   * Contract: this is invoked as `deps.requestFrame(cb)` — a METHOD call on
   * the deps object, so `this` inside the supplied function is `deps`, not
   * whatever `this` the function would normally expect. Native rAF is
   * spec-branded on web (requires `this === window`) and throws "Illegal
   * invocation" if a bare reference to it is passed here. Callers MUST supply
   * a bound or wrapped function (e.g. `(cb) => requestAnimationFrame(cb)`),
   * never a bare reference to a `this`-sensitive native function
   * (Sentry PS-48/PS-49).
   */
  requestFrame: (cb: () => void) => void;
  /** Called once, when the redirect is abandoned because the justifying route group changed. */
  onAbandon?: (route: string, scheduledGroup: string | undefined, currentGroup: string | undefined) => void;
  /** Called when the navigator never became ready within maxAttempts (see PR #510 / Sentry issue 2K). */
  onExhausted: (error: unknown, route: string, attempts: number) => void;
  /** Bounds the "navigator not ready" retry loop. Defaults to 10, matching the pre-fix behavior. */
  maxAttempts?: number;
};

/**
 * Schedules `route` on the next frame via `deps.requestFrame`, guarded two ways:
 *
 * - Group changed since scheduling → ABANDON permanently, no retry. The guard
 *   effect re-runs on segments changes, so a still-needed redirect gets
 *   re-scheduled on its own; a stale one should not fire at all.
 * - Navigator not ready (navigate() throws) → RETRY on the next frame, up to
 *   maxAttempts, exactly as before this fix. Reports via onExhausted if the
 *   navigator never becomes ready.
 *
 * `scheduledGroup` must be captured by the caller at schedule time (i.e. the
 * segments[0] that justified this redirect), not re-derived here.
 */
export function performGuardedNavigation(
  route: string,
  scheduledGroup: string | undefined,
  deps: GuardedNavigationDeps,
  attempt = 0
): void {
  deps.requestFrame(() => {
    const currentGroup = deps.getCurrentGroup();
    if (currentGroup !== scheduledGroup) {
      deps.onAbandon?.(route, scheduledGroup, currentGroup);
      return;
    }

    try {
      deps.navigate(route);
    } catch (e) {
      const maxAttempts = deps.maxAttempts ?? 10;
      if (attempt < maxAttempts) {
        performGuardedNavigation(route, scheduledGroup, deps, attempt + 1);
      } else {
        deps.onExhausted(e, route, attempt + 1);
      }
    }
  });
}
