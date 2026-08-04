import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowPostImportUpsell,
  hasPostImportUpsellBeenShown,
  checkPostImportUpsell,
  markPostImportUpsellShown,
  savePendingPostImportMoment,
  loadPendingPostImportMoment,
  clearPendingPostImportMoment,
} from '@/lib/post-import-upsell-service';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const removeItemMock = AsyncStorage.removeItem as jest.Mock;
const trackMock = analytics.track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setItemMock.mockResolvedValue(undefined);
  removeItemMock.mockResolvedValue(undefined);
});

/** Back the AsyncStorage mock with a real in-memory store, so multi-step flows
 *  (complete-while-hidden -> next mount -> second mount) read what they wrote. */
function useInMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  getItemMock.mockImplementation(async (key: string) => store.get(key) ?? null);
  setItemMock.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  removeItemMock.mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

describe('shouldShowPostImportUpsell — pure state machine', () => {
  it('non-premium + items imported + never shown -> show', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 42, alreadyShown: false })
    ).toBe(true);
  });

  it('premium user -> never show, regardless of items/shown-state', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: true, itemCount: 42, alreadyShown: false })
    ).toBe(false);
  });

  it('already shown -> do not show (one-shot; a re-import never re-triggers)', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 42, alreadyShown: true })
    ).toBe(false);
  });

  it('0 items imported -> never show', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 0, alreadyShown: false })
    ).toBe(false);
  });
});

describe('hasPostImportUpsellBeenShown', () => {
  it('returns false when no flag persisted', async () => {
    getItemMock.mockResolvedValue(null);
    expect(await hasPostImportUpsellBeenShown()).toBe(false);
  });

  it('returns true when the flag was persisted', async () => {
    getItemMock.mockResolvedValue('true');
    expect(await hasPostImportUpsellBeenShown()).toBe(true);
  });

  it('fails closed (treats as already shown) when AsyncStorage throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await hasPostImportUpsellBeenShown()).toBe(true);
  });
});

describe('checkPostImportUpsell — read-only, no side effects', () => {
  it('resolves show:true for a non-premium user who imported and never saw it', async () => {
    getItemMock.mockResolvedValue(null);

    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 12 });

    expect(result).toEqual({ show: true });
    expect(setItemMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not show for a premium user (and never touches storage)', async () => {
    const result = await checkPostImportUpsell({ isPremium: true, itemCount: 12 });

    expect(result).toEqual({ show: false });
    expect(getItemMock).not.toHaveBeenCalled();
  });

  it('does not show a second time once the flag is persisted', async () => {
    getItemMock.mockResolvedValue('true');

    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 12 });

    expect(result).toEqual({ show: false });
  });

  it('does not show when the import printed 0 stubs (and never touches storage)', async () => {
    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 0 });

    expect(result).toEqual({ show: false });
    expect(getItemMock).not.toHaveBeenCalled();
  });
});

describe('markPostImportUpsellShown', () => {
  it('persists the shown-flag and fires premium:post_import_prompt_shown with counts', async () => {
    await markPostImportUpsellShown({ showCount: 30, movieCount: 120 });

    expect(setItemMock).toHaveBeenCalledWith('post_import_upsell.shown', 'true');
    expect(trackMock).toHaveBeenCalledWith('premium:post_import_prompt_shown', {
      showCount: 30,
      movieCount: 120,
    });
  });

  it('still fires the event even if AsyncStorage.setItem throws (best-effort persistence)', async () => {
    setItemMock.mockRejectedValue(new Error('storage unavailable'));

    await markPostImportUpsellShown({ showCount: 5, movieCount: 9 });

    expect(trackMock).toHaveBeenCalledWith('premium:post_import_prompt_shown', {
      showCount: 5,
      movieCount: 9,
    });
  });
});

// ---------------------------------------------------------------------------
// Durable pending-moment record (#776) — written by the import-run provider at
// completion (focus-independent), consumed by the screen on next mount.
// ---------------------------------------------------------------------------

const MOMENT = { stubs: 132, showCount: 30, movieCount: 12, episodeCount: 90 };
const NOW = 1_754_000_000_000;
const PENDING_KEY = 'post_import_upsell.pending';
const DAY_MS = 24 * 60 * 60 * 1000;

let dateNowSpy: jest.SpyInstance;
beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  dateNowSpy.mockRestore();
});

describe('pending post-import moment — save/load/clear', () => {
  it('round-trips the record written at completion, stamped with completedAt', async () => {
    useInMemoryStorage();

    await savePendingPostImportMoment(MOMENT);

    expect(await loadPendingPostImportMoment()).toEqual({ ...MOMENT, completedAt: NOW });
  });

  it('resolves null when no completion is pending', async () => {
    useInMemoryStorage();
    expect(await loadPendingPostImportMoment()).toBeNull();
  });

  it('clear removes the record', async () => {
    useInMemoryStorage();
    await savePendingPostImportMoment(MOMENT);

    await clearPendingPostImportMoment();

    expect(await loadPendingPostImportMoment()).toBeNull();
  });

  it('a fresh record inside the TTL is still returned days later', async () => {
    useInMemoryStorage();
    await savePendingPostImportMoment(MOMENT);

    dateNowSpy.mockReturnValue(NOW + 6 * DAY_MS);

    expect(await loadPendingPostImportMoment()).toEqual({ ...MOMENT, completedAt: NOW });
  });

  it('an 8-day-old record is stale: cleared and null (the moment has passed)', async () => {
    const store = useInMemoryStorage();
    await savePendingPostImportMoment(MOMENT);

    dateNowSpy.mockReturnValue(NOW + 8 * DAY_MS);

    expect(await loadPendingPostImportMoment()).toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('fails closed on a corrupt record (null + cleared, never crash)', async () => {
    const store = useInMemoryStorage();
    store.set(PENDING_KEY, 'not json {');

    expect(await loadPendingPostImportMoment()).toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('fails closed on missing/mistyped counts (null + cleared)', async () => {
    const store = useInMemoryStorage();
    store.set(PENDING_KEY, JSON.stringify({ stubs: 'lots' }));

    expect(await loadPendingPostImportMoment()).toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('fails closed on a pre-TTL-era record with no completedAt (null + cleared, not crashed on)', async () => {
    const store = useInMemoryStorage();
    store.set(PENDING_KEY, JSON.stringify(MOMENT)); // old format: counts only

    expect(await loadPendingPostImportMoment()).toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('fails closed on a garbage completedAt (null + cleared)', async () => {
    const store = useInMemoryStorage();
    store.set(PENDING_KEY, JSON.stringify({ ...MOMENT, completedAt: 'yesterday' }));

    expect(await loadPendingPostImportMoment()).toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('fails closed (null, no prompt) when AsyncStorage read throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    removeItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await loadPendingPostImportMoment()).toBeNull();
  });

  it('save and clear swallow storage errors (best-effort, never crash the run)', async () => {
    setItemMock.mockRejectedValue(new Error('storage unavailable'));
    removeItemMock.mockRejectedValue(new Error('storage unavailable'));

    await expect(savePendingPostImportMoment(MOMENT)).resolves.toBeUndefined();
    await expect(clearPendingPostImportMoment()).resolves.toBeUndefined();
  });
});

describe('backgrounded import path — completion observed on next mount (#776)', () => {
  it('pitches exactly once: eligible on the mount that finds the record, never again after', async () => {
    useInMemoryStorage();

    // Import completes while the app is backgrounded/navigated-away: the
    // provider persists the pending record; no screen is there to consume it.
    await savePendingPostImportMoment(MOMENT);

    // Next visit to the import screen: the record is found and the upsell is
    // eligible for a non-premium user.
    const pending = await loadPendingPostImportMoment();
    expect(pending).toEqual({ ...MOMENT, completedAt: NOW });
    const first = await checkPostImportUpsell({ isPremium: false, itemCount: pending!.stubs });
    expect(first.show).toBe(true);

    // The sheet becomes visible: shown-flag burns, record is consumed.
    await markPostImportUpsellShown({
      showCount: pending!.showCount,
      movieCount: pending!.movieCount,
    });
    await clearPendingPostImportMoment();
    expect(trackMock).toHaveBeenCalledWith('premium:post_import_prompt_shown', {
      showCount: 30,
      movieCount: 12,
    });

    // A later visit finds nothing pending — the sequence never restarts.
    expect(await loadPendingPostImportMoment()).toBeNull();

    // Even a whole NEW import completing (record re-written) can't re-prompt:
    // the once-ever shown-flag holds.
    await savePendingPostImportMoment({ ...MOMENT, stubs: 7 });
    const second = await checkPostImportUpsell({ isPremium: false, itemCount: 7 });
    expect(second.show).toBe(false);
  });

  it('a premium user found at consume time is never shown the pending moment', async () => {
    useInMemoryStorage();
    await savePendingPostImportMoment(MOMENT);

    const pending = await loadPendingPostImportMoment();
    const result = await checkPostImportUpsell({ isPremium: true, itemCount: pending!.stubs });

    expect(result.show).toBe(false);
  });

  it('an unconsumed record survives (moment retried next visit, not lost)', async () => {
    useInMemoryStorage();
    await savePendingPostImportMoment(MOMENT);

    // Screen unmounted mid-sequence: nothing was marked or cleared. The next
    // mount still finds the record and remains eligible.
    const retry = await loadPendingPostImportMoment();
    expect(retry).toEqual({ ...MOMENT, completedAt: NOW });
    expect((await checkPostImportUpsell({ isPremium: false, itemCount: retry!.stubs })).show).toBe(
      true
    );
  });
});
