/**
 * The upsell's opening line.
 *
 * The regression that matters is the zero case: this sheet is the first-dollar
 * moment, and it opened with "You just brought over 0 shows and 0 movies"
 * whenever an import added only episodes to already-tracked shows. It survived
 * because until #768 the sheet could never render, so no test and no human ever
 * saw the sentence.
 */
import {
  describeImportHaul,
  postImportUpsellMessage,
} from '@/lib/post-import-upsell-copy';

describe('describeImportHaul', () => {
  it('names both when both are present', () => {
    expect(describeImportHaul({ showCount: 5, movieCount: 12, episodeCount: 90 }))
      .toBe('5 shows and 12 movies');
  });

  it('omits the zero side rather than saying "and 0 movies"', () => {
    expect(describeImportHaul({ showCount: 5, movieCount: 0, episodeCount: 90 }))
      .toBe('5 shows');
    expect(describeImportHaul({ showCount: 0, movieCount: 12, episodeCount: 0 }))
      .toBe('12 movies');
  });

  it('falls back to episodes when no new shows or movies landed', () => {
    // The re-import case: episodes attach to shows the user already tracks, so
    // both headline counts are 0 while the import was real.
    expect(describeImportHaul({ showCount: 0, movieCount: 0, episodeCount: 13 }))
      .toBe('13 episodes');
  });

  it('singularises', () => {
    expect(describeImportHaul({ showCount: 1, movieCount: 1, episodeCount: 0 }))
      .toBe('1 show and 1 movie');
    expect(describeImportHaul({ showCount: 0, movieCount: 0, episodeCount: 1 }))
      .toBe('1 episode');
  });

  it('returns null when there is nothing countable', () => {
    expect(describeImportHaul({ showCount: 0, movieCount: 0, episodeCount: 0 })).toBeNull();
  });
});

describe('postImportUpsellMessage', () => {
  it('NEVER says "0 shows" or "0 movies" — the bug this file exists for', () => {
    const cases = [
      { showCount: 0, movieCount: 0, episodeCount: 13 },
      { showCount: 0, movieCount: 0, episodeCount: 0 },
      { showCount: 3, movieCount: 0, episodeCount: 0 },
      { showCount: 0, movieCount: 7, episodeCount: 0 },
    ];
    for (const c of cases) {
      const msg = postImportUpsellMessage(c);
      expect(msg).not.toMatch(/\b0 (shows?|movies?|episodes?)\b/);
    }
  });

  it('leads with the real haul and keeps the taste-profile pitch', () => {
    const msg = postImportUpsellMessage({ showCount: 5, movieCount: 12, episodeCount: 90 });
    expect(msg).toContain('You brought over 5 shows and 12 movies.');
    expect(msg).toContain('taste profile');
  });

  it('degrades to a sentence that still reads when nothing is countable', () => {
    const msg = postImportUpsellMessage({ showCount: 0, movieCount: 0, episodeCount: 0 });
    expect(msg).toContain('Your library landed in PocketStubs.');
    expect(msg).toContain('taste profile');
  });
});
