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

/**
 * Max ids per tier-lookup request. PostgREST puts the `in` list in the query
 * string, so one unbounded request risks a URL-length rejection (which would
 * take down the whole tick) or a max-rows truncation (which would silently
 * read as "no profile row" for real members). 200 keeps the URL small enough
 * to be uninteresting at any plausible candidate count.
 */
export const TIER_LOOKUP_CHUNK_SIZE = 200;

export function chunkIds(
  ids: readonly string[],
  size: number = TIER_LOOKUP_CHUNK_SIZE
): string[][] {
  if (size < 1) throw new Error(`chunkIds: size must be >= 1, got ${size}`);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export interface TierRow extends ProfileTier {
  id: string;
}

export interface ResolveTiersResult {
  tierByUserId: Map<string, ProfileTier>;
  /** Chunks whose lookup errored — their users fall through to fail-closed */
  failedChunks: number;
  /** Requested ids that produced no row (lookup error, or genuinely absent) */
  unresolved: number;
}

/**
 * Resolves account tiers for many user ids, one chunk per request.
 *
 * A failing chunk is reported and skipped rather than aborting the run: its
 * users simply have no entry in the map, and isPremiumTier treats a missing
 * entry as not-entitled. That's the same fail-closed guarantee an early return
 * gave, without throwing away the whole tick's sends — including the day-of
 * variant, whose own comment in index.ts says a later failure must not take it
 * down.
 *
 * IO is injected so this stays a pure, Jest-testable unit (the house pattern
 * for this folder — see build-reminder-payload.ts).
 */
export async function resolveTiers(
  userIds: readonly string[],
  fetchChunk: (
    ids: string[]
  ) => Promise<{ data: TierRow[] | null; error: unknown }>,
  options: {
    chunkSize?: number;
    onChunkError?: (error: unknown, ids: string[]) => void;
  } = {}
): Promise<ResolveTiersResult> {
  const { chunkSize = TIER_LOOKUP_CHUNK_SIZE, onChunkError } = options;
  const tierByUserId = new Map<string, ProfileTier>();
  let failedChunks = 0;

  for (const ids of chunkIds(userIds, chunkSize)) {
    let result: { data: TierRow[] | null; error: unknown };
    try {
      result = await fetchChunk(ids);
    } catch (thrown) {
      // A rejected request is the same class of problem as an error payload.
      result = { data: null, error: thrown };
    }

    if (result.error) {
      failedChunks++;
      onChunkError?.(result.error, ids);
      continue;
    }

    for (const row of result.data ?? []) {
      if (row?.id) tierByUserId.set(row.id, row);
    }
  }

  return {
    tierByUserId,
    failedChunks,
    unresolved: new Set(userIds).size - tierByUserId.size,
  };
}
