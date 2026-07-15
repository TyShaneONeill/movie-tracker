import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';
import type { TMDBMovie } from '@/lib/tmdb.types';

// Unresolved "Needs a look" items persist per-user so the review list survives
// leaving the import screen and is resumable from Settings -> Import. Keyed by
// user id — a shared device must never surface one account's imports to another.

const KEY_PREFIX = '@cinetrak/tvtime_import_needs_review:';

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** A movie the matcher couldn't confidently place, carried with its TMDB
 *  candidates so the review list + fix-a-match sheet can render offline. */
export interface PersistedReviewItem {
  title: string;
  releaseDate: string | null;
  status: 'watched' | 'watchlist';
  watchedAt: string | null;
  rewatchCount: number;
  candidates: TMDBMovie[];
}

/** Stable identity for an item (title + year) so resolve/remove is idempotent. */
export function reviewItemId(item: Pick<PersistedReviewItem, 'title' | 'releaseDate'>): string {
  return `${item.title.trim().toLowerCase()}|${item.releaseDate ?? ''}`;
}

export async function loadNeedsReview(userId: string): Promise<PersistedReviewItem[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedReviewItem[]) : [];
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'tvtime-import-load-needs-review',
    });
    return [];
  }
}

export async function saveNeedsReview(userId: string, items: PersistedReviewItem[]): Promise<void> {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(keyFor(userId));
      return;
    }
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'tvtime-import-save-needs-review',
    });
  }
}

/** Remove one resolved item and persist the remainder. Returns what's left so
 *  the caller can update its in-memory list from the same source of truth. */
export async function resolveNeedsReviewItem(
  userId: string,
  id: string
): Promise<PersistedReviewItem[]> {
  const items = await loadNeedsReview(userId);
  const remaining = items.filter((item) => reviewItemId(item) !== id);
  await saveNeedsReview(userId, remaining);
  return remaining;
}

export async function clearNeedsReview(userId: string): Promise<void> {
  await saveNeedsReview(userId, []);
}

// --- Entry-card dismissal (home + onboarding) ------------------------------
const CARD_DISMISS_PREFIX = '@cinetrak/tvtime_import_card_dismissed:';

export async function isImportCardDismissed(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${CARD_DISMISS_PREFIX}${userId}`)) === '1';
  } catch {
    return false;
  }
}

export async function dismissImportCard(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CARD_DISMISS_PREFIX}${userId}`, '1');
  } catch {
    // non-fatal; the card simply reappears next launch
  }
}
