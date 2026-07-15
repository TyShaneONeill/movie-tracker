import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTvTimeExport } from '@/lib/tvtime-import/parser';
import type { TvTimeFileMap } from '@/lib/tvtime-import/types';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'gdpr-sample');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

/** The full sanitized export (seeded account), as the UI would hand it over. */
function fullExport(): TvTimeFileMap {
  return {
    'tracking-prod-records-v2.csv': loadFixture('tracking-prod-records-v2.csv'),
    'tracking-prod-records.csv': loadFixture('tracking-prod-records.csv'),
    'user_tv_show_data.csv': loadFixture('user_tv_show_data.csv'),
  };
}

// Ground truth for House of the Dragon episodes: "s{season}e{episode}" -> TVDB ep id.
const HOTD_EPISODES: Record<string, number> = {
  s1e1: 8287133,
  s1e2: 9082147,
  s1e3: 9082148,
  s1e4: 9082149,
  s1e5: 9082150,
  s1e6: 9082151,
  s1e7: 9082152,
  s1e8: 9082153,
  s1e9: 9082154,
  s1e10: 9082155,
  s2e1: 10396624,
  s2e2: 10396629,
  s2e3: 10396630,
  s2e4: 10396631,
  s2e5: 10396632,
  s2e6: 10396633,
  s2e7: 10396634,
  s2e8: 10396635,
};

describe('parseTvTimeExport — real GDPR fixture', () => {
  it('parses exactly the 4 followed shows with correct TVDB ids', () => {
    const { shows } = parseTvTimeExport(fullExport());
    const byId = new Map(shows.map((s) => [s.tvdbId, s]));

    expect(shows).toHaveLength(4);
    expect(byId.get(371572)?.name).toBe('House of the Dragon');
    expect(byId.get(293088)?.name).toBe('One-Punch Man');
    expect(byId.get(253463)?.name).toBe('Black Mirror');
    expect(byId.get(275274)?.name).toBe('Rick and Morty');
    expect(shows.every((s) => s.followed)).toBe(true);
  });

  it('skips the aggregate stats row (blank series id)', () => {
    const { shows } = parseTvTimeExport(fullExport());
    // Only the 4 real series survive — the tracking-stats row is dropped.
    expect(shows.map((s) => s.tvdbId).sort()).toEqual([253463, 275274, 293088, 371572]);
  });

  it('parses all 18 House of the Dragon episodes with right S/E + TVDB ep ids', () => {
    const { shows } = parseTvTimeExport(fullExport());
    const hotd = shows.find((s) => s.tvdbId === 371572)!;

    expect(hotd.episodes).toHaveLength(18);
    const actual: Record<string, number> = {};
    for (const ep of hotd.episodes) {
      actual[`s${ep.season}e${ep.episode}`] = ep.tvdbEpisodeId;
      expect(ep.watchedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
    expect(actual).toEqual(HOTD_EPISODES);

    const seasons = new Set(hotd.episodes.map((e) => e.season));
    expect([...seasons].sort()).toEqual([1, 2]);
    expect(hotd.episodes.filter((e) => e.season === 1)).toHaveLength(10);
    expect(hotd.episodes.filter((e) => e.season === 2)).toHaveLength(8);
  });

  it('leaves the other three shows with zero episodes', () => {
    const { shows } = parseTvTimeExport(fullExport());
    for (const id of [293088, 253463, 275274]) {
      expect(shows.find((s) => s.tvdbId === id)!.episodes).toHaveLength(0);
    }
  });

  it('reflects is_favorited from the crosscheck file (all false here)', () => {
    const { shows } = parseTvTimeExport(fullExport());
    expect(shows.every((s) => s.favorited === false)).toBe(true);
  });

  it('parses 2 watched + 2 watchlist movies with correct release dates', () => {
    const { movies } = parseTvTimeExport(fullExport());
    const byTitle = new Map(movies.map((m) => [m.title, m]));

    expect(movies).toHaveLength(4);

    const joker = byTitle.get('Joker')!;
    expect(joker.status).toBe('watched');
    expect(joker.releaseDate).toBe('2019-10-03');
    expect(joker.watchedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const hp = byTitle.get('Harry Potter and the Chamber of Secrets')!;
    expect(hp.status).toBe('watched');
    expect(hp.releaseDate).toBe('2002-12-06');

    const sheep = byTitle.get('The Sheep Detectives')!;
    expect(sheep.status).toBe('watchlist');
    expect(sheep.releaseDate).toBe('2026-05-07');
    expect(sheep.watchedAt).toBeNull();

    const obsession = byTitle.get('Obsession')!;
    expect(obsession.status).toBe('watchlist');
    expect(obsession.releaseDate).toBe('2026-05-14');

    const watched = movies.filter((m) => m.status === 'watched');
    const watchlist = movies.filter((m) => m.status === 'watchlist');
    expect(watched).toHaveLength(2);
    expect(watchlist).toHaveLength(2);
  });

  it('produces no warnings for a clean export', () => {
    expect(parseTvTimeExport(fullExport()).warnings).toEqual([]);
  });
});

describe('parseTvTimeExport — robustness', () => {
  const SHOW_HEADER =
    'created_at,is_followed,s_id,ep_id,s_no,ep_no,season_number,episode_number,series_name';
  const MOVIE_HEADER =
    'uuid,type,entity_type,movie_name,release_date,rewatch_count,created_at';

  it('tolerates a completely empty file map', () => {
    const payload = parseTvTimeExport({});
    expect(payload).toEqual({ shows: [], movies: [], warnings: [] });
  });

  it('handles a movies-only export (no shows file)', () => {
    const csv = [
      MOVIE_HEADER,
      'u1,watch,movie,Heat,1995-12-15 00:00:00,0,2026-07-14 23:38:56',
    ].join('\n');
    const payload = parseTvTimeExport({ 'tracking-prod-records.csv': csv });
    expect(payload.shows).toEqual([]);
    expect(payload.movies).toEqual([
      { title: 'Heat', releaseDate: '1995-12-15', status: 'watched', watchedAt: '2026-07-14 23:38:56', rewatchCount: 0 },
    ]);
  });

  it('handles a shows-only export (no movies file)', () => {
    const csv = [
      SHOW_HEADER,
      '2026-01-01 00:00:00,true,111,,,,,,Some Show',
    ].join('\n');
    const payload = parseTvTimeExport({ 'tracking-prod-records-v2.csv': csv });
    expect(payload.movies).toEqual([]);
    expect(payload.shows).toHaveLength(1);
    expect(payload.shows[0]).toMatchObject({ tvdbId: 111, name: 'Some Show', followed: true });
  });

  it('dedupes duplicate episode rows by TVDB episode id', () => {
    const epRow = '2026-01-01 00:00:00,,371572,9082147,1,2,1,2,House of the Dragon';
    const csv = [SHOW_HEADER, epRow, epRow, epRow].join('\n');
    const payload = parseTvTimeExport({ 'tracking-prod-records-v2.csv': csv });
    expect(payload.shows[0].episodes).toHaveLength(1);
    expect(payload.shows[0].episodes[0].tvdbEpisodeId).toBe(9082147);
    expect(payload.warnings).toEqual([]);
  });

  it('dedupes movie rows by uuid, watched winning over towatch', () => {
    const csv = [
      MOVIE_HEADER,
      'u9,follow,movie,Dune,2021-10-22 00:00:00,0,2026-07-14 23:38:56',
      'u9,towatch,movie,Dune,2021-10-22 00:00:00,0,2026-07-14 23:38:56',
      'u9,watch,movie,Dune,2021-10-22 00:00:00,1,2026-07-14 23:40:00',
    ].join('\n');
    const payload = parseTvTimeExport({ 'tracking-prod-records.csv': csv });
    expect(payload.movies).toHaveLength(1);
    expect(payload.movies[0]).toMatchObject({ title: 'Dune', status: 'watched', rewatchCount: 1, watchedAt: '2026-07-14 23:40:00' });
  });

  it('collects malformed rows into warnings instead of throwing', () => {
    const showCsv = [
      SHOW_HEADER,
      // ep_id present but no season/episode numbers -> malformed
      '2026-01-01 00:00:00,,371572,9082147,,,,,House of the Dragon',
    ].join('\n');
    const movieCsv = [
      MOVIE_HEADER,
      // entity_type movie but blank title -> malformed
      'u1,watch,movie,,2020-01-01 00:00:00,0,2026-07-14 23:38:56',
      // non-movie noise rows -> silently skipped, no warning
      'time-count,time-count,,,,,2026-07-14 23:38:56',
    ].join('\n');

    let payload!: ReturnType<typeof parseTvTimeExport>;
    expect(() => {
      payload = parseTvTimeExport({
        'tracking-prod-records-v2.csv': showCsv,
        'tracking-prod-records.csv': movieCsv,
      });
    }).not.toThrow();

    expect(payload.warnings.length).toBe(2);
    expect(payload.warnings.some((w) => w.includes('episode'))).toBe(true);
    expect(payload.warnings.some((w) => w.includes('movie'))).toBe(true);
    // The malformed episode row is dropped before any show is created.
    expect(payload.shows).toHaveLength(0);
    expect(payload.movies).toHaveLength(0);
  });

  it('matches export files by basename even when nested in ZIP paths', () => {
    const csv = [MOVIE_HEADER, 'u1,watch,movie,Heat,1995-12-15 00:00:00,0,2026-07-14 23:38:56'].join('\n');
    const payload = parseTvTimeExport({ 'export/data/tracking-prod-records.csv': csv });
    expect(payload.movies).toHaveLength(1);
  });
});
