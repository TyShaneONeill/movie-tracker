/**
 * Tier eligibility for release reminders.
 *
 * Release Reminders is advertised as a PocketStubs+ feature on /upgrade, so the
 * sender has to be the enforcement point, not just the settings toggle: users
 * who switched the reminder on while it was ungated still have
 * notification_preferences rows saying "on", and a client-side gate can't reach
 * those. Filtering here is what actually stops the sends.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is Jest-testable via relative path from __tests__/edge-functions/ —
 * same arrangement as build-reminder-payload.ts.
 */

export interface ProfileTier {
  account_tier?: string | null;
  tier_expires_at?: string | null;
}

/**
 * Whether a profile row carries an active premium entitlement.
 *
 * Mirrors two existing sources of truth rather than inventing a third:
 * - the tier vocabulary in lib/premium-service.ts — the profiles check
 *   constraint stores free|premium|dev, and 'plus' is accepted as the alias the
 *   client-side PremiumTier uses;
 * - the expiry sweep in get_user_scan_status (migration 20260525063629), which
 *   treats 'premium' with a past tier_expires_at as free. That sweep only runs
 *   when the user hits the app, so a churned subscriber's row can still read
 *   'premium' indefinitely — checking the expiry here is what keeps a lapsed
 *   subscriber from receiving a paid notification forever.
 */
export function isPremiumTier(
  profile: ProfileTier | undefined,
  now: Date = new Date()
): boolean {
  const tier = profile?.account_tier;
  if (tier === "dev") return true;
  if (tier !== "premium" && tier !== "plus") return false;

  const expiresAt = profile?.tier_expires_at;
  if (!expiresAt) return true; // no expiry recorded = active (matches the RPC)

  const parsed = Date.parse(expiresAt);
  // An unparseable timestamp shouldn't silently revoke a paying member's
  // notifications — treat it as active and let the tier column stand.
  return Number.isNaN(parsed) || parsed > now.getTime();
}

/** Drops reminders whose recipient no longer holds an active premium tier. */
export function filterRemindersToPremium<T extends { user_id: string }>(
  reminders: readonly T[],
  tierByUserId: ReadonlyMap<string, ProfileTier>,
  now: Date = new Date()
): T[] {
  return reminders.filter((r) => isPremiumTier(tierByUserId.get(r.user_id), now));
}
