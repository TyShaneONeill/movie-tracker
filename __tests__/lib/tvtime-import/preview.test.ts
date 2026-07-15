import { buildImportPreview, buildReviewItems } from '@/lib/tvtime-import/preview';
import type { TMDBMovie } from '@/lib/tmdb.types';
import type {
  MatchedMovie,
  MatchedShow,
  MovieNeedsReview,
  ParsedMovie,
  ParsedShow,
  TvTimeMatchResult,
} from '@/lib/tvtime-import/types';

function tmdbMovie(id: number, title: string, release_date: string): TMDBMovie {
  return {
    id,
    title,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    release_date,
    vote_average: 0,
    vote_count: 0,
    genre_ids: [],
  };
}

function matchedShow(tmdbId: number, name: string, episodes: number): MatchedShow {
  return {
    tvdbId: tmdbId,
    name,
    followed: true,
    favorited: false,
    episodes: Array.from({ length: episodes }, (_, i) => ({
      tvdbEpisodeId: tmdbId * 1000 + i,
      season: 1,
      episode: i + 1,
      watchedAt: null,
    })),
    tmdbId,
    tmdbName: name,
  };
}

function matchedMovie(tmdbId: number, title: string, status: 'watched' | 'watchlist'): MatchedMovie {
  return {
    title,
    releaseDate: '2020-01-01',
    status,
    watchedAt: status === 'watched' ? '2020-06-01 12:00:00' : null,
    rewatchCount: 0,
    tmdbId,
    tmdbMovie: tmdbMovie(tmdbId, title, '2020-01-01'),
  };
}

function parsedMovie(title: string): ParsedMovie {
  return { title, releaseDate: '2026-01-01', status: 'watched', watchedAt: null, rewatchCount: 0 };
}

function needsReview(title: string, candidateCount: number): MovieNeedsReview {
  return {
    ...parsedMovie(title),
    candidates: Array.from({ length: candidateCount }, (_, i) => tmdbMovie(9000 + i, `${title} ${i}`, '2026-01-01')),
  };
}

function result(overrides: Partial<TvTimeMatchResult> = {}): TvTimeMatchResult {
  return {
    shows: { matched: [], unmatched: [] },
    movies: { matched: [], needsReview: [], unmatched: [] },
    warnings: [],
    ...overrides,
  };
}

describe('buildImportPreview', () => {
  it('translates matched counts into PocketStubs vocabulary buckets', () => {
    const match = result({
      shows: { matched: [matchedShow(1, 'Show A', 10), matchedShow(2, 'Show B', 8)], unmatched: [] },
      movies: {
        matched: [matchedMovie(10, 'M1', 'watched'), matchedMovie(11, 'M2', 'watchlist'), matchedMovie(12, 'M3', 'watchlist')],
        needsReview: [],
        unmatched: [],
      },
    });

    const preview = buildImportPreview(match);
    expect(preview.episodes).toBe(18); // 10 + 8
    expect(preview.shows).toBe(2);
    expect(preview.moviesWatched).toBe(1);
    expect(preview.moviesWatchlist).toBe(2);
    expect(preview.needsAttention).toBe(0);
  });

  it('counts parse warnings, unmatched, and needs-review as needing attention', () => {
    const match = result({
      shows: { matched: [matchedShow(1, 'S', 3)], unmatched: [{ tvdbId: 99, name: 'X', followed: true, favorited: false, episodes: [] } as ParsedShow] },
      movies: { matched: [], needsReview: [needsReview('Obsession', 2)], unmatched: [parsedMovie('The Sheep Detectives')] },
      warnings: ['Skipped malformed movie row (uuid="")'],
    });

    const preview = buildImportPreview(match);
    // 1 warning + 1 unmatched show + 1 unmatched movie + 1 needs-review = 4
    expect(preview.needsAttention).toBe(4);
    expect(preview.episodes).toBe(3);
  });
});

describe('buildReviewItems', () => {
  it('lists needs-review (with candidates) before unmatched (no candidates)', () => {
    const match = result({
      movies: {
        matched: [],
        needsReview: [needsReview('Obsession', 3)],
        unmatched: [parsedMovie('The Sheep Detectives')],
      },
    });

    const items = buildReviewItems(match);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Obsession');
    expect(items[0].candidates.length).toBe(3);
    expect(items[1].title).toBe('The Sheep Detectives');
    expect(items[1].candidates).toEqual([]);
  });

  it('caps candidates at 6 per item', () => {
    const match = result({ movies: { matched: [], needsReview: [needsReview('Busy', 12)], unmatched: [] } });
    expect(buildReviewItems(match)[0].candidates.length).toBe(6);
  });
});
