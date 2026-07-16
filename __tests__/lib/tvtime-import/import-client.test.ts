import {
  chunkImportItems,
  mapMatchToImportItems,
  runTvTimeImport,
  ChunkTooLargeError,
  type ImportChunk,
} from '@/lib/tvtime-import/import-client';
import { emptyImportCounts, type ImportCounts, type ImportMovie, type ImportShow } from '@/lib/tvtime-import/import-types';
import type { MatchedMovie, MatchedShow, MovieNeedsReview, ParsedShow, TvTimeMatchResult } from '@/lib/tvtime-import/types';
import type { TMDBMovie } from '@/lib/tmdb.types';

// Hoisted above imports by babel-jest; the module never hits the network here
// (runTvTimeImport takes an injected `send`), but the import graph resolves it.
jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

function show(id: number, episodes: number): ImportShow {
  return {
    tmdbShowId: id,
    name: `Show ${id}`,
    followed: false,
    favorited: false,
    episodes: Array.from({ length: episodes }, (_, i) => ({ season: 1, episode: i + 1, watchedAt: null })),
  };
}

function movie(id: number): ImportMovie {
  return { tmdbId: id, title: `Movie ${id}`, status: 'watched', watchedAt: null, rewatchCount: 0 };
}

function countsWith(over: Partial<ImportCounts>): ImportCounts {
  return { ...emptyImportCounts(), ...over };
}

describe('chunkImportItems', () => {
  it('returns no chunks when there is nothing to import', () => {
    expect(chunkImportItems([], [])).toEqual([]);
  });

  it('respects the per-call movie ceiling', () => {
    const movies = [movie(1), movie(2), movie(3), movie(4), movie(5)];
    const chunks = chunkImportItems([], movies, { maxMovies: 2 });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.movies.length)).toEqual([2, 2, 1]);
  });

  it('respects the per-call episode ceiling across shows', () => {
    const shows = [show(1, 3), show(2, 3), show(3, 3)];
    const chunks = chunkImportItems(shows, [], { maxEpisodes: 5 });
    // 3 + 3 > 5 -> shows 1 and 2 can't share; greedy packs 1 per chunk here.
    const episodesPerChunk = chunks.map((c) => c.shows.reduce((s, sh) => s + sh.episodes.length, 0));
    episodesPerChunk.forEach((n) => expect(n).toBeLessThanOrEqual(5));
    expect(episodesPerChunk.reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('splits a single oversized show across chunks', () => {
    const chunks = chunkImportItems([show(1, 12)], [], { maxEpisodes: 5 });
    const episodesPerChunk = chunks.map((c) => c.shows.reduce((s, sh) => s + sh.episodes.length, 0));
    expect(episodesPerChunk).toEqual([5, 5, 2]);
    // Every part keeps the same show id / metadata.
    chunks.forEach((c) => expect(c.shows[0].tmdbShowId).toBe(1));
  });

  it('zips shows and movies so a call carries both within their caps', () => {
    const chunks = chunkImportItems([show(1, 2), show(2, 2)], [movie(1), movie(2)], { maxEpisodes: 2, maxMovies: 1 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].shows).toHaveLength(1);
    expect(chunks[0].movies).toHaveLength(1);
  });
});

describe('mapMatchToImportItems', () => {
  const tmdb = (id: number, title: string): TMDBMovie => ({
    id,
    title,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    release_date: '2020-01-01',
    vote_average: 0,
    vote_count: 0,
    genre_ids: [],
  });

  it('maps only confidently matched items and drops needs-review / unmatched', () => {
    const matchedShow: MatchedShow = {
      tvdbId: 5, name: 'Series', followed: true, favorited: true,
      episodes: [{ tvdbEpisodeId: 1, season: 2, episode: 4, watchedAt: '2021-01-01 00:00:00' }],
      tmdbId: 500, tmdbName: 'Series (TMDB)',
    };
    const matchedMovie: MatchedMovie = {
      title: 'Film', releaseDate: '2019-05-01', status: 'watched', watchedAt: null, rewatchCount: 2,
      tmdbId: 42, tmdbMovie: tmdb(42, 'Film'),
    };
    const needsReview: MovieNeedsReview = {
      title: 'Ambiguous', releaseDate: '2020-01-01', status: 'watchlist', watchedAt: null, rewatchCount: 0,
      candidates: [tmdb(9, 'Ambiguous')],
    };
    const match: TvTimeMatchResult = {
      shows: { matched: [matchedShow], unmatched: [{ tvdbId: 7 } as ParsedShow] },
      movies: { matched: [matchedMovie], needsReview: [needsReview], unmatched: [] },
      warnings: [],
    };

    const items = mapMatchToImportItems(match);
    // Only the confidently-matched show/movie map through (needsReview +
    // unmatched are dropped).
    expect(items.shows).toHaveLength(1);
    expect(items.shows[0]).toMatchObject({
      tmdbShowId: 500,
      name: 'Series (TMDB)',
      followed: true,
      favorited: true,
      episodes: [{ season: 2, episode: 4, watchedAt: '2021-01-01 00:00:00' }],
    });
    expect(items.movies).toHaveLength(1);
    expect(items.movies[0]).toMatchObject({
      tmdbId: 42,
      title: 'Film',
      status: 'watched',
      watchedAt: null,
      rewatchCount: 2,
    });
  });

  it('threads TMDB metadata (poster/genres) onto mapped movies + shows', () => {
    const movieWithArt = tmdb(42, 'Film');
    movieWithArt.poster_path = '/p.jpg';
    movieWithArt.genre_ids = [18, 53];
    const matchedShow: MatchedShow = {
      tvdbId: 5, name: 'Series', followed: true, favorited: false,
      episodes: [], tmdbId: 500, tmdbName: 'Series',
      posterPath: '/s.jpg', genreIds: [10765], numberOfEpisodes: 20, numberOfSeasons: 2,
    };
    const matchedMovie: MatchedMovie = {
      title: 'Film', releaseDate: '2019-05-01', status: 'watched', watchedAt: null, rewatchCount: 0,
      tmdbId: 42, tmdbMovie: movieWithArt,
    };
    const match: TvTimeMatchResult = {
      shows: { matched: [matchedShow], unmatched: [] },
      movies: { matched: [matchedMovie], needsReview: [], unmatched: [] },
      warnings: [],
    };
    const items = mapMatchToImportItems(match);
    expect(items.movies[0]).toMatchObject({ posterPath: '/p.jpg', genreIds: [18, 53] });
    expect(items.shows[0]).toMatchObject({ posterPath: '/s.jpg', genreIds: [10765], numberOfEpisodes: 20, numberOfSeasons: 2 });
  });
});

describe('runTvTimeImport', () => {
  it('sends each chunk once and aggregates counts + progress', async () => {
    const send = jest.fn(async (chunk: ImportChunk) =>
      countsWith({ moviesInserted: chunk.movies.length, episodesInserted: chunk.shows.reduce((s, sh) => s + sh.episodes.length, 0) })
    );
    const progress: number[] = [];

    const counts = await runTvTimeImport({
      shows: [show(1, 4)],
      movies: [movie(1), movie(2), movie(3)],
      importKey: 'k',
      accessToken: 't',
      send,
      caps: { maxEpisodes: 100, maxMovies: 100 },
      onProgress: (p) => progress.push(p.processed),
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(counts.moviesInserted).toBe(3);
    expect(counts.episodesInserted).toBe(4);
    expect(progress[progress.length - 1]).toBe(7); // 4 episodes + 3 movies
  });

  it('re-slices a chunk that the server rejects as too large (413)', async () => {
    const send = jest.fn(async (chunk: ImportChunk) => {
      if (chunk.movies.length > 2) throw new ChunkTooLargeError();
      return countsWith({ moviesInserted: chunk.movies.length });
    });

    const counts = await runTvTimeImport({
      shows: [],
      movies: [movie(1), movie(2), movie(3), movie(4)],
      importKey: 'k',
      accessToken: 't',
      send,
      caps: { maxEpisodes: 5000, maxMovies: 4 },
    });

    // One rejected 4-movie call, then two accepted 2-movie calls.
    expect(send).toHaveBeenCalledTimes(3);
    expect(counts.moviesInserted).toBe(4);
  });

  it('retries a transiently-failed chunk once (idempotent server)', async () => {
    let calls = 0;
    const send = jest.fn(async (chunk: ImportChunk) => {
      calls += 1;
      if (calls === 1) throw new Error('network blip');
      return countsWith({ moviesInserted: chunk.movies.length });
    });

    const counts = await runTvTimeImport({
      shows: [],
      movies: [movie(1)],
      importKey: 'k',
      accessToken: 't',
      send,
      caps: { maxMovies: 10, maxEpisodes: 10 },
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(counts.moviesInserted).toBe(1);
  });
});
