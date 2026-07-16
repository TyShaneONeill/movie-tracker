import * as fs from 'fs';
import * as path from 'path';
import { parseTvTimeExport } from '@/lib/tvtime-import/parser';
import { matchTvTimePayload } from '@/lib/tvtime-import/matcher';
import { buildImportPreview } from '@/lib/tvtime-import/preview';
import { mapMatchToImportItems, chunkImportItems } from '@/lib/tvtime-import/import-client';
import type { TmdbGateway, TvTimeFileMap } from '@/lib/tvtime-import/types';
import type { TMDBMovie } from '@/lib/tmdb.types';

// import-client pulls in the real supabase client at module load; the pipeline
// under test never calls it (mock gateway + no send), so stub it out.
jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

// End-to-end pipeline check against the committed GDPR sample fixture (the same
// one PR 1's parser test uses). Proves the parse -> match -> preview -> chunk
// numbers WITHOUT a device and WITHOUT the `find-by-external-id` edge fn (an
// all-resolving mock gateway stands in for TMDB).

const FIXTURE_DIR = path.resolve(__dirname, '__fixtures__', 'gdpr-sample');

function loadFixture(): TvTimeFileMap {
  const files: TvTimeFileMap = {};
  for (const name of ['tracking-prod-records-v2.csv', 'tracking-prod-records.csv', 'user_tv_show_data.csv']) {
    files[name] = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
  }
  return files;
}

// Mock gateway: resolves every show (TVDB -> TMDB) and returns an exact-title,
// exact-year candidate for every movie so confident matching succeeds.
const allResolvingGateway: TmdbGateway = {
  async findTvByTvdbId(tvdbId) {
    return { id: tvdbId, name: `Show ${tvdbId}` };
  },
  async searchMovie(title) {
    const movie: TMDBMovie = {
      id: Math.abs(hash(title)),
      title,
      overview: '',
      poster_path: null,
      backdrop_path: null,
      release_date: currentYearGuess(title),
      vote_average: 0,
      vote_count: 0,
      genre_ids: [],
    };
    return [movie];
  },
};

// A tiny deterministic hash so mock tmdb ids are stable per title.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h || 1;
}

// The fixture's release dates are read from the parsed movies below; the mock
// echoes the parsed year so confident matching lines up. Resolved lazily.
let yearByTitle = new Map<string, string>();
function currentYearGuess(title: string): string {
  return yearByTitle.get(title.trim().toLowerCase()) ?? '2020-01-01';
}

describe('TV Time fixture pipeline', () => {
  const files = loadFixture();
  const parsed = parseTvTimeExport(files);

  beforeAll(() => {
    yearByTitle = new Map(parsed.movies.map((m) => [m.title.trim().toLowerCase(), m.releaseDate ?? '2020-01-01']));
  });

  const totalEpisodes = () => parsed.shows.reduce((s, sh) => s + sh.episodes.length, 0);

  it('parses the fixture into 4 shows with watched episodes and split movies', () => {
    expect(parsed.shows.length).toBe(4);
    // House of the Dragon carries 18 watched episodes (PR 1 parser test).
    expect(parsed.shows.find((s) => s.tvdbId === 371572)?.episodes.length).toBe(18);
    expect(totalEpisodes()).toBeGreaterThanOrEqual(18);
    expect(parsed.movies.length).toBeGreaterThan(0);
    // Movies split cleanly into watched vs watchlist buckets.
    const watched = parsed.movies.filter((m) => m.status === 'watched').length;
    const watchlist = parsed.movies.filter((m) => m.status === 'watchlist').length;
    expect(watched + watchlist).toBe(parsed.movies.length);
  });

  it('translates the whole matched payload into preview counts', async () => {
    const match = await matchTvTimePayload(parsed, allResolvingGateway);
    const preview = buildImportPreview(match);
    // Every show resolves (mock gateway) -> preview mirrors the parsed totals.
    expect(preview.shows).toBe(4);
    expect(preview.episodes).toBe(totalEpisodes());
    expect(preview.moviesWatched).toBe(parsed.movies.filter((m) => m.status === 'watched').length);
    expect(preview.moviesWatchlist).toBe(parsed.movies.filter((m) => m.status === 'watchlist').length);
  });

  it('maps to an import payload and chunks within the edge-fn caps', async () => {
    const match = await matchTvTimePayload(parsed, allResolvingGateway);
    const items = mapMatchToImportItems(match);
    expect(items.shows.length).toBe(4);
    expect(items.movies.length).toBe(parsed.movies.length);

    const chunks = chunkImportItems(items.shows, items.movies);
    expect(chunks.length).toBe(1); // small fixture -> a single call within caps
    const eps = chunks[0].shows.reduce((s, sh) => s + sh.episodes.length, 0);
    expect(eps).toBe(totalEpisodes());
    expect(eps).toBeLessThanOrEqual(5000);
    expect(chunks[0].movies.length).toBeLessThanOrEqual(2000);
  });
});
