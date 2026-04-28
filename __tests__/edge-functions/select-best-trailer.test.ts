import { selectBestTrailer, type TMDBVideosResponse } from '../../supabase/functions/_shared/select-best-trailer';

function makeVideo(overrides: Partial<{
  site: string;
  type: string;
  key: string;
  official: boolean;
  published_at: string;
}> = {}) {
  return {
    iso_639_1: 'en',
    iso_3166_1: 'US',
    name: 'Trailer',
    key: overrides.key ?? 'KEY1',
    site: overrides.site ?? 'YouTube',
    size: 1080,
    type: overrides.type ?? 'Trailer',
    official: overrides.official ?? true,
    published_at: overrides.published_at ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('selectBestTrailer', () => {
  it('returns null for empty results', () => {
    const response: TMDBVideosResponse = { results: [] };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns null when only Vimeo videos exist', () => {
    const response: TMDBVideosResponse = {
      results: [makeVideo({ site: 'Vimeo' })],
    };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns null when only Featurette/BTS types exist', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Featurette' }),
        makeVideo({ type: 'Behind the Scenes' }),
      ],
    };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns the key of a single official YouTube Trailer', () => {
    const response: TMDBVideosResponse = {
      results: [makeVideo({ key: 'TRAILER_KEY' })],
    };
    expect(selectBestTrailer(response)).toBe('TRAILER_KEY');
  });

  it('prefers Trailer over Teaser', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Teaser', key: 'TEASER' }),
        makeVideo({ type: 'Trailer', key: 'TRAILER' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('TRAILER');
  });

  it('prefers official over unofficial when types match', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ official: false, key: 'UNOFFICIAL' }),
        makeVideo({ official: true, key: 'OFFICIAL' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('OFFICIAL');
  });

  it('prefers most-recent published_at when type and official match', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ published_at: '2026-01-01T00:00:00.000Z', key: 'OLD' }),
        makeVideo({ published_at: '2026-06-01T00:00:00.000Z', key: 'NEW' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('NEW');
  });

  it('type rank beats official status (official Teaser loses to unofficial Trailer)', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Teaser', official: true, key: 'OFFICIAL_TEASER' }),
        makeVideo({ type: 'Trailer', official: false, key: 'UNOFFICIAL_TRAILER' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('UNOFFICIAL_TRAILER');
  });
});
