import type { GroupedUserMovie } from '@/lib/database.types';

// Profile "Watched" collection grid: 3 posters per row.
export const PROFILE_GRID_COLUMNS = 3;

// Ad cadence in the collection. Designed to be "kind" to full profiles: the
// first ad doesn't appear until after PROFILE_AD_FIRST movies, so a large
// collection's first look is ad-free and the ad sits below the fold. Sparse
// collections (1–PROFILE_AD_FIRST movies) get a single ad at the bottom. After
// the first ad, one ad every PROFILE_AD_INTERVAL movies.
export const PROFILE_AD_FIRST = 9;
export const PROFILE_AD_INTERVAL = 12;

export type ProfileCollectionRow =
  | { type: 'movies'; key: string; items: GroupedUserMovie[] }
  | { type: 'ad'; key: string };

/**
 * Turn a flat list of watched movies into grid rows (PROFILE_GRID_COLUMNS each),
 * with ad rows interleaved per the cadence above. Pure + unit-tested so the ad
 * placement logic is independent of the grid rendering.
 */
export function buildProfileCollectionRows(
  movies: GroupedUserMovie[],
  opts: { adsEnabled: boolean }
): ProfileCollectionRow[] {
  const rows: ProfileCollectionRow[] = [];
  if (movies.length === 0) return rows;

  let count = 0;
  let nextAdAt = PROFILE_AD_FIRST;
  let insertedAd = false;

  for (let i = 0; i < movies.length; i += PROFILE_GRID_COLUMNS) {
    const items = movies.slice(i, i + PROFILE_GRID_COLUMNS);
    rows.push({ type: 'movies', key: `row-${i}`, items });
    count += items.length;

    if (opts.adsEnabled && count >= nextAdAt) {
      rows.push({ type: 'ad', key: `ad-${count}` });
      insertedAd = true;
      nextAdAt = count + PROFILE_AD_INTERVAL;
    }
  }

  // Sparse collections (1–9 movies) never reach the first ad slot — give them a
  // single ad at the bottom so these profiles still carry one.
  if (opts.adsEnabled && !insertedAd) {
    rows.push({ type: 'ad', key: 'ad-end' });
  }

  return rows;
}
