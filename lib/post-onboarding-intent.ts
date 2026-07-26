// One-shot handoff of a navigation intent across the onboarding → tabs boundary.
// Pushing a route from the onboarding screen right after router.replace('/(tabs)')
// races the navigator teardown and the push is silently dropped (the onboarding
// "Import from TV Time" CTA dead-ended on home). The surviving screen (home)
// consumes this on mount, when the navigator is provably alive.
let pendingRoute: string | null = null;

export function setPostOnboardingRoute(route: string) {
  pendingRoute = route;
}

export function consumePostOnboardingRoute(): string | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}
