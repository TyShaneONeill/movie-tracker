import { COMPLETE_GENRE_MAP, TMDB_GENRE_MAP, TV_GENRE_MAP } from '@/lib/tmdb.types';

/**
 * Regression: the stats Top Genres bar blends movie + TV genres. When the name
 * lookup only knew movie genres, every TV genre fell back to the literal
 * "Other" — so two distinct TV genres rendered as two duplicate "Other" rows.
 */
describe('COMPLETE_GENRE_MAP — movie + TV genre coverage', () => {
  it('maps distinct TV genre IDs to distinct real names (no duplicate "Other")', () => {
    expect(COMPLETE_GENRE_MAP[10765]).toBe('Sci-Fi & Fantasy');
    expect(COMPLETE_GENRE_MAP[10759]).toBe('Action & Adventure');
    expect(COMPLETE_GENRE_MAP[10765]).not.toBe(COMPLETE_GENRE_MAP[10759]);
    // Neither should ever fall back to the "Other" bucket.
    expect(COMPLETE_GENRE_MAP[10765]).not.toBe('Other');
    expect(COMPLETE_GENRE_MAP[10759]).not.toBe('Other');
  });

  it('still resolves movie genres', () => {
    expect(COMPLETE_GENRE_MAP[16]).toBe('Animation');
    expect(COMPLETE_GENRE_MAP[878]).toBe('Sci-Fi');
  });

  it('covers every movie and TV genre id', () => {
    for (const id of Object.keys(TMDB_GENRE_MAP)) {
      expect(COMPLETE_GENRE_MAP[Number(id)]).toBeDefined();
    }
    for (const id of Object.keys(TV_GENRE_MAP)) {
      expect(COMPLETE_GENRE_MAP[Number(id)]).toBeDefined();
    }
  });
});
