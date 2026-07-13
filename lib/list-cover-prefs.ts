/**
 * Per-device cover choice for the VIRTUAL special lists (Watchlist / Watching),
 * which have no `user_lists` row to hang a `cover_tmdb_id` column on (contract C).
 *
 * There is no clean general-purpose per-user prefs field on `profiles` (the two
 * jsonb columns there are semantically owned — avatar_config, calendar filters),
 * so v1 stores the special-list marquee choice in AsyncStorage. Tradeoff:
 * device-local, lost on reinstall, does not sync across devices. Acceptable
 * behind the founder-only flag; a future round can promote this to a
 * `profiles.list_cover_prefs` jsonb column if covers need to sync. Custom lists
 * (which DO have a row) persist server-side via `user_lists.cover_tmdb_id`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';

const KEY = '@cinetrak/list_cover_prefs';

/** Which virtual special list a cover choice belongs to. */
export type SpecialListId = 'watchlist' | 'watching';

type CoverPrefs = Partial<Record<SpecialListId, number>>;

async function readAll(): Promise<CoverPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CoverPrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'list-cover-prefs-read',
    });
    return {};
  }
}

/** Read the chosen cover TMDB id for a special list, or null if unset. */
export async function getSpecialListCover(id: SpecialListId): Promise<number | null> {
  const prefs = await readAll();
  const value = prefs[id];
  return typeof value === 'number' ? value : null;
}

/** Set (or clear, with null) the chosen cover TMDB id for a special list. */
export async function setSpecialListCover(
  id: SpecialListId,
  tmdbId: number | null
): Promise<void> {
  try {
    const prefs = await readAll();
    if (tmdbId == null) delete prefs[id];
    else prefs[id] = tmdbId;
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'list-cover-prefs-set',
    });
  }
}
