import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadNeedsReview,
  saveNeedsReview,
  resolveNeedsReviewItem,
  clearNeedsReview,
  reviewItemId,
  getImportBannerDismissal,
  recordImportBannerDismissal,
  isBannerAllowedByDismissal,
  MAX_BANNER_DISMISSALS,
  BANNER_SNOOZE_MS,
  markImportCompleted,
  hasCompletedImportLocally,
  type PersistedReviewItem,
} from '@/lib/tvtime-import/import-storage';

// Back the globally-mocked AsyncStorage with an in-memory store for this suite.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => (store.has(k) ? store.get(k)! : null));
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store.set(k, v);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    store.delete(k);
  });
});

function item(title: string, releaseDate: string | null, id?: string): PersistedReviewItem {
  return {
    id: id ?? `${title.trim().toLowerCase()}|${releaseDate ?? ''}#0`,
    title,
    releaseDate,
    status: 'watched',
    watchedAt: null,
    rewatchCount: 0,
    candidates: [],
  };
}

const USER = 'user-abc';

describe('needs-review persistence', () => {
  it('round-trips saved items keyed by user', async () => {
    const items = [item('Obsession', '2026-01-01'), item('The Sheep Detectives', '2026-01-01')];
    await saveNeedsReview(USER, items);
    expect(await loadNeedsReview(USER)).toEqual(items);
  });

  it('isolates one user from another', async () => {
    await saveNeedsReview(USER, [item('Mine', null)]);
    expect(await loadNeedsReview('other-user')).toEqual([]);
  });

  it('saving an empty list clears the key', async () => {
    await saveNeedsReview(USER, [item('X', null)]);
    await saveNeedsReview(USER, []);
    expect(await loadNeedsReview(USER)).toEqual([]);
  });

  it('resolves a single item by id and persists the remainder', async () => {
    const a = item('Obsession', '2026-01-01');
    const b = item('The Sheep Detectives', '2026-01-01');
    await saveNeedsReview(USER, [a, b]);

    const remaining = await resolveNeedsReviewItem(USER, reviewItemId(a));
    expect(remaining).toEqual([b]);
    expect(await loadNeedsReview(USER)).toEqual([b]);
  });

  it('reviewItemId prefers the assigned id, falling back to title|year', () => {
    // With an id, that id is the identity.
    expect(reviewItemId(item('Obsession', '2026-01-01', 'obsession|2026-01-01#3'))).toBe('obsession|2026-01-01#3');
    // Without an id (legacy item), it falls back to a case/whitespace-normalized title|year.
    expect(reviewItemId({ title: '  Obsession ', releaseDate: '2026-01-01' })).toBe(
      reviewItemId({ title: 'obsession', releaseDate: '2026-01-01' })
    );
  });

  it('two same-title+year items with distinct ids resolve independently (no collision)', async () => {
    const a = item('Obsession', '2026-01-01', 'obsession|2026-01-01#0');
    const b = item('Obsession', '2026-01-01', 'obsession|2026-01-01#1');
    await saveNeedsReview(USER, [a, b]);

    const remaining = await resolveNeedsReviewItem(USER, reviewItemId(a));
    // Resolving `a` leaves `b` intact — the duplicate is NOT silently dropped.
    expect(remaining).toEqual([b]);
  });

  it('clearNeedsReview empties the list', async () => {
    await saveNeedsReview(USER, [item('X', null)]);
    await clearNeedsReview(USER);
    expect(await loadNeedsReview(USER)).toEqual([]);
  });

  it('tolerates corrupt stored JSON by returning an empty list', async () => {
    store.set('@cinetrak/tvtime_import_needs_review:' + USER, '{not json');
    expect(await loadNeedsReview(USER)).toEqual([]);
  });
});

describe('home banner dismissal (return policy)', () => {
  it('defaults to zero dismissals, never dismissed', async () => {
    expect(await getImportBannerDismissal(USER)).toEqual({ count: 0, lastDismissedAt: null });
  });

  it('records a dismissal: increments count + stamps time, isolated per user', async () => {
    const before = Date.now();
    const after = await recordImportBannerDismissal(USER);
    expect(after.count).toBe(1);
    expect(after.lastDismissedAt).toBeGreaterThanOrEqual(before);
    const persisted = await getImportBannerDismissal(USER);
    expect(persisted.count).toBe(1);
    expect(await getImportBannerDismissal('someone-else')).toEqual({ count: 0, lastDismissedAt: null });
  });

  it('accumulates across dismissals', async () => {
    await recordImportBannerDismissal(USER);
    const second = await recordImportBannerDismissal(USER);
    expect(second.count).toBe(2);
  });

  it('migrates the legacy binary flag to count=1 with a real timestamp (14d snooze, not instant resurrect)', async () => {
    const before = Date.now();
    store.set('@cinetrak/tvtime_import_card_dismissed:' + USER, '1');
    const d = await getImportBannerDismissal(USER);
    expect(d.count).toBe(1);
    expect(d.lastDismissedAt).toBeGreaterThanOrEqual(before); // NOW, not null
    // Persisted + legacy key cleared, so the timestamp is stable across reads.
    expect(store.get('@cinetrak/tvtime_import_card_dismissed:' + USER)).toBeUndefined();
    const again = await getImportBannerDismissal(USER);
    expect(again.lastDismissedAt).toBe(d.lastDismissedAt);
    // A just-migrated legacy dismissal is snoozed (not immediately shown).
    expect(isBannerAllowedByDismissal(d)).toBe(false);
  });
});

describe('isBannerAllowedByDismissal (state machine)', () => {
  const now = 1_000_000_000_000;
  it('shows when never dismissed', () => {
    expect(isBannerAllowedByDismissal({ count: 0, lastDismissedAt: null }, now)).toBe(true);
  });
  it('hides during the snooze window, returns after it expires', () => {
    const justDismissed = { count: 1, lastDismissedAt: now };
    expect(isBannerAllowedByDismissal(justDismissed, now + BANNER_SNOOZE_MS - 1)).toBe(false);
    expect(isBannerAllowedByDismissal(justDismissed, now + BANNER_SNOOZE_MS + 1)).toBe(true);
  });
  it('is permanent once dismissed MAX times, even after the snooze', () => {
    const maxed = { count: MAX_BANNER_DISMISSALS, lastDismissedAt: now };
    expect(isBannerAllowedByDismissal(maxed, now + BANNER_SNOOZE_MS * 10)).toBe(false);
  });
  it('fails closed while loading (null)', () => {
    expect(isBannerAllowedByDismissal(null, now)).toBe(false);
  });
});

describe('local completed-import marker', () => {
  it('defaults false, then persists true per user', async () => {
    expect(await hasCompletedImportLocally(USER)).toBe(false);
    await markImportCompleted(USER);
    expect(await hasCompletedImportLocally(USER)).toBe(true);
    expect(await hasCompletedImportLocally('other')).toBe(false);
  });
});
