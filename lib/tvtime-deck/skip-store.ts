/**
 * Per-user persistence of deck items the user SKIPPED (rather than rated).
 *
 * Rated state is authoritative on the server (a review row exists), so it needs
 * no client store — a rated item simply drops out of the eligibility read.
 * Skips have no server artifact, so we persist them per-user in AsyncStorage:
 * this survives app kill/reopen (the deck resumes exactly where it left off) and
 * keeps skips re-surfaceable later via `clearSkipped`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `tvtime_deck_skipped:${userId}`;

/** The set of skipped item keys (`${mediaType}:${tmdbId}`) for a user. */
export async function getSkipped(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** Add one item key to the user's skip set (idempotent). */
export async function addSkipped(userId: string, itemKey: string): Promise<void> {
  const set = await getSkipped(userId);
  if (set.has(itemKey)) return;
  set.add(itemKey);
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify([...set]));
  } catch {
    // Best-effort: a failed persist just means the item may re-surface sooner.
  }
}

/** Clear all skips for the user, re-surfacing previously-skipped items. */
export async function clearSkipped(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // no-op
  }
}
