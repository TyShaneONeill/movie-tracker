import {
  buildUnifiedResults,
  countsFor,
  filterByScope,
  selectRescueTarget,
  rescueCopy,
  formatLedgerDate,
  type ScopeCounts,
} from '../../lib/search-v2-logic';
import type { TMDBMovie, TMDBTvShow, TMDBActor } from '../../lib/tmdb.types';

function movie(id: number, title: string, overrides: Partial<TMDBMovie> = {}): TMDBMovie {
  return {
    id,
    title,
    overview: '',
    poster_path: `/m${id}.jpg`,
    backdrop_path: null,
    release_date: '2024-01-01',
    vote_average: 8,
    vote_count: 100,
    genre_ids: [],
    ...overrides,
  };
}

function tv(id: number, name: string, overrides: Partial<TMDBTvShow> = {}): TMDBTvShow {
  return {
    id,
    name,
    overview: '',
    poster_path: `/t${id}.jpg`,
    backdrop_path: null,
    first_air_date: '2022-01-01',
    vote_average: 7.5,
    vote_count: 100,
    genre_ids: [],
    origin_country: ['US'],
    original_language: 'en',
    popularity: 10,
    ...overrides,
  };
}

const actor = (id: number, name: string): TMDBActor => ({ id, name, profile_path: `/p${id}.jpg` });

describe('buildUnifiedResults', () => {
  it('orders movies, then TV, then person', () => {
    const results = buildUnifiedResults(
      [movie(1, 'Dune')],
      [tv(2, 'Dune: Prophecy')],
      actor(3, 'Denis Villeneuve'),
      ['Dune', 'Arrival', 'Sicario']
    );
    expect(results.map((r) => r.scope)).toEqual(['movie', 'tv', 'person']);
    expect(results[0].key).toBe('movie-1');
    expect(results[2].title).toBe('Denis Villeneuve');
    expect(results[2].meta).toBe('Dune, Arrival, Sicario');
  });

  it('omits the person when none is returned', () => {
    const results = buildUnifiedResults([movie(1, 'Dune')], [], null);
    expect(results).toHaveLength(1);
    expect(results.every((r) => r.scope !== 'person')).toBe(true);
  });

  it('builds movie meta as year · rating and tv meta as year · Series · rating', () => {
    const [m] = buildUnifiedResults([movie(1, 'Dune')], [], null);
    expect(m.meta).toBe('2024 · ★ 8.0');
    const [, ...rest] = buildUnifiedResults([movie(1, 'Dune')], [tv(2, 'Severance')], null);
    expect(rest[0].meta).toBe('2022 · Series · ★ 7.5');
  });

  it('caps the known-for line at three titles', () => {
    const [p] = buildUnifiedResults([], [], actor(9, 'Person'), ['A', 'B', 'C', 'D']);
    expect(p.meta).toBe('A, B, C');
  });
});

describe('countsFor', () => {
  it('counts each scope plus the all total', () => {
    const results = buildUnifiedResults(
      [movie(1, 'A'), movie(2, 'B')],
      [tv(3, 'C')],
      actor(4, 'D')
    );
    expect(countsFor(results)).toEqual({ all: 4, movie: 2, tv: 1, person: 1 });
  });
});

describe('filterByScope', () => {
  const results = buildUnifiedResults([movie(1, 'A')], [tv(2, 'B')], actor(3, 'C'));

  it('returns everything for all', () => {
    expect(filterByScope(results, 'all')).toHaveLength(3);
  });

  it('filters to a single content scope', () => {
    expect(filterByScope(results, 'tv').map((r) => r.id)).toEqual([2]);
  });

  it('returns nothing for the user scope (backed separately)', () => {
    expect(filterByScope(results, 'user')).toEqual([]);
  });
});

describe('selectRescueTarget', () => {
  const counts = (o: Partial<ScopeCounts>): ScopeCounts => ({
    all: 0,
    movie: 0,
    tv: 0,
    person: 0,
    ...o,
  });

  it('rescues from an empty active scope to the fullest other scope', () => {
    expect(selectRescueTarget('movie', counts({ tv: 2, person: 1 }))).toBe('tv');
  });

  it('returns null when the active scope has hits', () => {
    expect(selectRescueTarget('movie', counts({ movie: 3, tv: 2 }))).toBeNull();
  });

  it('returns null when no other scope has hits', () => {
    expect(selectRescueTarget('movie', counts({ movie: 0 }))).toBeNull();
  });

  it('never rescues from all or user', () => {
    expect(selectRescueTarget('all', counts({ movie: 2 }))).toBeNull();
    expect(selectRescueTarget('user', counts({ movie: 2 }))).toBeNull();
  });

  it('breaks ties movie > tv > person', () => {
    expect(selectRescueTarget('person', counts({ movie: 2, tv: 2 }))).toBe('movie');
    expect(selectRescueTarget('movie', counts({ tv: 2, person: 2 }))).toBe('tv');
  });
});

describe('rescueCopy', () => {
  it('renders the movie→tv case from the mock', () => {
    const copy = rescueCopy('severance', 'movie', 'tv');
    expect(copy.lead).toBe('No movies called “severance”. The show, though — ');
    expect(copy.emphasis).toBe('it’s in TV.');
    expect(copy.cta).toBe('Show all TV results →');
  });

  it('adapts the copy to other scope pairs', () => {
    expect(rescueCopy('dune', 'tv', 'movie').emphasis).toBe('it’s in Movies.');
    expect(rescueCopy('nolan', 'movie', 'person').emphasis).toBe('they’re in People.');
    expect(rescueCopy('nolan', 'movie', 'person').cta).toBe('Show all People results →');
  });

  it('trims the query in the lead', () => {
    expect(rescueCopy('  dune  ', 'movie', 'tv').lead).toContain('“dune”');
  });
});

describe('formatLedgerDate', () => {
  const now = new Date('2026-07-10T12:00:00').getTime();

  it('labels today and yesterday', () => {
    expect(formatLedgerDate(new Date('2026-07-10T09:00:00').getTime(), now)).toBe('Today');
    expect(formatLedgerDate(new Date('2026-07-09T23:00:00').getTime(), now)).toBe('Yesterday');
  });

  it('uses a weekday within the last week', () => {
    // 2026-07-06 is a Monday.
    expect(formatLedgerDate(new Date('2026-07-06T09:00:00').getTime(), now)).toBe('Mon');
  });

  it('uses month + day beyond a week', () => {
    expect(formatLedgerDate(new Date('2026-07-02T09:00:00').getTime(), now)).toBe('Jul 2');
  });
});
