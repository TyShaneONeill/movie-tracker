import {
  ONBOARDING_GENRES,
  MIN_GENRES,
  genreSlugsToTmdbIds,
  genreSlugsToLabels,
} from '@/components/onboarding/v2/data/genres';

describe('onboarding v2 genre data', () => {
  it('has 12 chips and a sane minimum', () => {
    expect(ONBOARDING_GENRES).toHaveLength(12);
    expect(MIN_GENRES).toBe(3);
  });

  it('maps genre slugs to TMDB ids', () => {
    expect(genreSlugsToTmdbIds(['sci-fi', 'drama'])).toEqual([878, 18]);
  });

  it('drops slugs that have no TMDB genre id (e.g. Indie)', () => {
    expect(genreSlugsToTmdbIds(['indie'])).toEqual([]);
    // Indie is kept as a stored preference but contributes no discover query.
    expect(genreSlugsToTmdbIds(['action', 'indie'])).toEqual([28]);
  });

  it('ignores unknown slugs', () => {
    expect(genreSlugsToTmdbIds(['not-a-genre'])).toEqual([]);
  });

  it('maps slugs to display labels', () => {
    expect(genreSlugsToLabels(['sci-fi', 'indie'])).toEqual(['Sci-Fi', 'Indie']);
  });
});
