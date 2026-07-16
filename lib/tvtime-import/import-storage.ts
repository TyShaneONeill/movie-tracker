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
  /** Unique, stable identity assigned at build time. Two movies with the same
   *  title+year must NOT collide — otherwise they'd share a React key and
   *  resolving one would silently drop the other. */
  id: string;
  title: string;
  releaseDate: string | null;
  status: 'watched' | 'watchlist';
  watchedAt: string | null;
  rewatchCount: number;
  candidates: TMDBMovie[];
}

/** Stable identity for an item. Prefers the assigned `id` (unique even for
 *  duplicate title+year); falls back to title|year for items built before an
 *  id was assigned. */
export function reviewItemId(item: Pick<PersistedReviewItem, 'title' | 'releaseDate'> & { id?: string }): string {
  if (item.id) return item.id;
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

// --- Home banner dismissal state (return policy) ---------------------------
// The banner can return a bounded number of times: dismissing snoozes it for a
// window; after enough dismissals (or a successful import) it's gone for good.
// We persist how many times it's been dismissed and when it was last dismissed,
// per user. (Legacy binary key `@cinetrak/tvtime_import_card_dismissed:` from
// the first release is read once and migrated to count=1.)
const CARD_DISMISS_PREFIX = '@cinetrak/tvtime_import_card_dismissal:';
const LEGACY_DISMISS_PREFIX = '@cinetrak/tvtime_import_card_dismissed:';

export interface ImportBannerDismissal {
  /** How many times the user has dismissed the banner. */
  count: number;
  /** Epoch ms of the most recent dismissal, or null if never dismissed. */
  lastDismissedAt: number | null;
}

const NO_DISMISSAL: ImportBannerDismissal = { count: 0, lastDismissedAt: null };

export async function getImportBannerDismissal(userId: string): Promise<ImportBannerDismissal> {
  try {
    const raw = await AsyncStorage.getItem(`${CARD_DISMISS_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ImportBannerDismissal>;
      return {
        count: typeof parsed.count === 'number' ? parsed.count : 0,
        lastDismissedAt: typeof parsed.lastDismissedAt === 'number' ? parsed.lastDismissedAt : null,
      };
    }
    // Migrate the legacy binary flag: a prior dismissal counts as one.
    const legacy = await AsyncStorage.getItem(`${LEGACY_DISMISS_PREFIX}${userId}`);
    if (legacy === '1') return { count: 1, lastDismissedAt: null };
    return NO_DISMISSAL;
  } catch {
    return NO_DISMISSAL;
  }
}

/** Record a dismissal: increment the count and stamp the time. Returns the new
 *  state so callers can update in-memory from the same source of truth. */
export async function recordImportBannerDismissal(userId: string): Promise<ImportBannerDismissal> {
  const current = await getImportBannerDismissal(userId);
  const next: ImportBannerDismissal = { count: current.count + 1, lastDismissedAt: Date.now() };
  try {
    await AsyncStorage.setItem(`${CARD_DISMISS_PREFIX}${userId}`, JSON.stringify(next));
    await AsyncStorage.removeItem(`${LEGACY_DISMISS_PREFIX}${userId}`);
  } catch {
    // non-fatal; the banner simply reappears next launch
  }
  return next;
}
