import {
  buildProfileCollectionRows,
  PROFILE_AD_FIRST,
  PROFILE_AD_INTERVAL,
  PROFILE_GRID_COLUMNS,
} from '@/lib/profile-collection-rows';
import type { GroupedUserMovie } from '@/lib/database.types';

const movie = (i: number) => ({ tmdb_id: i } as unknown as GroupedUserMovie);
const movies = (n: number) => Array.from({ length: n }, (_, i) => movie(i));

const adCount = (rows: ReturnType<typeof buildProfileCollectionRows>) =>
  rows.filter((r) => r.type === 'ad').length;
const movieRows = (rows: ReturnType<typeof buildProfileCollectionRows>) =>
  rows.filter((r) => r.type === 'movies');

describe('buildProfileCollectionRows', () => {
  it('chunks movies into rows of PROFILE_GRID_COLUMNS', () => {
    const rows = movieRows(buildProfileCollectionRows(movies(7), { adsEnabled: false }));
    expect(rows).toHaveLength(3); // 3 + 3 + 1
    expect(rows[0].type === 'movies' && rows[0].items).toHaveLength(PROFILE_GRID_COLUMNS);
    expect(rows[2].type === 'movies' && rows[2].items).toHaveLength(1);
  });

  it('inserts no ads when adsEnabled is false', () => {
    expect(adCount(buildProfileCollectionRows(movies(50), { adsEnabled: false }))).toBe(0);
  });

  it('returns empty for an empty collection (no ad)', () => {
    expect(buildProfileCollectionRows([], { adsEnabled: true })).toEqual([]);
  });

  it('sparse collection (1–9 movies) gets a single ad at the bottom', () => {
    const rows = buildProfileCollectionRows(movies(5), { adsEnabled: true });
    expect(adCount(rows)).toBe(1);
    expect(rows[rows.length - 1].type).toBe('ad'); // last row is the ad
  });

  it('first ad lands after PROFILE_AD_FIRST movies (not before)', () => {
    const rows = buildProfileCollectionRows(movies(15), { adsEnabled: true });
    const firstAdIndex = rows.findIndex((r) => r.type === 'ad');
    // 3 movie-rows (9 movies) precede the first ad
    expect(firstAdIndex).toBe(PROFILE_AD_FIRST / PROFILE_GRID_COLUMNS);
  });

  it('then one ad every PROFILE_AD_INTERVAL movies', () => {
    // 9, 21, 33 → 3 ads for 33 movies
    expect(adCount(buildProfileCollectionRows(movies(33), { adsEnabled: true }))).toBe(3);
    // exactly at PROFILE_AD_FIRST → one ad at the bottom
    expect(adCount(buildProfileCollectionRows(movies(PROFILE_AD_FIRST), { adsEnabled: true }))).toBe(1);
    // one more interval reached
    expect(
      adCount(buildProfileCollectionRows(movies(PROFILE_AD_FIRST + PROFILE_AD_INTERVAL), { adsEnabled: true }))
    ).toBe(2);
  });
});
