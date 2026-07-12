import {
  isTvReview,
  reviewScopeCounts,
  shouldShowReviewScopeChips,
  filterReviewsByScope,
  sortReviews,
  reviewChipFlags,
} from '../../lib/reviews-v2-logic';
import type { Review } from '../../lib/database.types';

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: overrides.id ?? 'r1',
    user_id: 'u1',
    tmdb_id: 1,
    movie_title: 'Dune: Part Two',
    poster_path: '/p.jpg',
    title: 'A headline',
    review_text: 'Body copy.',
    rating: 8,
    is_spoiler: false,
    is_rewatch: false,
    media_type: 'movie',
    visibility: 'public',
    edited_at: null,
    like_count: 0,
    comment_count: 0,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  } as Review;
}

describe('isTvReview', () => {
  it('treats movie as not-TV and anything else as TV', () => {
    expect(isTvReview(review({ media_type: 'movie' }))).toBe(false);
    expect(isTvReview(review({ media_type: 'tv_show' }))).toBe(true);
  });
});

describe('reviewScopeCounts / shouldShowReviewScopeChips', () => {
  const reviews = [
    review({ id: 'a', media_type: 'movie' }),
    review({ id: 'b', media_type: 'movie' }),
    review({ id: 'c', media_type: 'tv_show' }),
  ];

  it('counts all / movie / tv', () => {
    expect(reviewScopeCounts(reviews)).toEqual({ all: 3, movie: 2, tv: 1 });
  });

  it('shows scope chips only when BOTH media types are present', () => {
    expect(shouldShowReviewScopeChips(reviews)).toBe(true);
    expect(shouldShowReviewScopeChips([review({ media_type: 'movie' })])).toBe(false);
    expect(shouldShowReviewScopeChips([review({ media_type: 'tv_show' })])).toBe(false);
    expect(shouldShowReviewScopeChips([])).toBe(false);
  });
});

describe('filterReviewsByScope', () => {
  const m1 = review({ id: 'm1', media_type: 'movie' });
  const m2 = review({ id: 'm2', media_type: 'movie' });
  const t1 = review({ id: 't1', media_type: 'tv_show' });
  const reviews = [m1, t1, m2];

  it('all → unchanged, preserving order', () => {
    expect(filterReviewsByScope(reviews, 'all')).toEqual([m1, t1, m2]);
  });
  it('movie → only movies', () => {
    expect(filterReviewsByScope(reviews, 'movie')).toEqual([m1, m2]);
  });
  it('tv → only TV', () => {
    expect(filterReviewsByScope(reviews, 'tv')).toEqual([t1]);
  });
});

describe('sortReviews', () => {
  const a = review({ id: 'a', rating: 6, like_count: 5, created_at: '2026-07-03T00:00:00Z' });
  const b = review({ id: 'b', rating: 9, like_count: 1, created_at: '2026-07-02T00:00:00Z' });
  const c = review({ id: 'c', rating: 3, like_count: 9, created_at: '2026-07-01T00:00:00Z' });
  const input = [a, b, c]; // already created_at desc from the query

  it('recent → pass-through in query order (does not mutate input)', () => {
    const out = sortReviews(input, 'recent');
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('popular → most liked first', () => {
    expect(sortReviews(input, 'popular').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('highest → best-rated first', () => {
    expect(sortReviews(input, 'highest').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('lowest → worst-rated first', () => {
    expect(sortReviews(input, 'lowest').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('treats a null like_count as 0 for popular', () => {
    const x = review({ id: 'x', like_count: null });
    const y = review({ id: 'y', like_count: 2 });
    expect(sortReviews([x, y], 'popular').map((r) => r.id)).toEqual(['y', 'x']);
  });
});

describe('reviewChipFlags', () => {
  it('derives TV / Rewatch / Edited flags from row state', () => {
    expect(reviewChipFlags(review({ media_type: 'tv_show' })).tv).toBe(true);
    expect(reviewChipFlags(review({ is_rewatch: true })).rewatch).toBe(true);
    expect(reviewChipFlags(review({ edited_at: '2026-07-10T00:00:00Z' })).edited).toBe(true);
    expect(reviewChipFlags(review()).rewatch).toBe(false);
  });

  it('shows a visibility chip ONLY when not public, keeping private vs followers distinct', () => {
    expect(reviewChipFlags(review({ visibility: 'public' })).visibility).toBeNull();
    expect(reviewChipFlags(review({ visibility: 'private' })).visibility).toBe('Private');
    expect(reviewChipFlags(review({ visibility: 'followers_only' })).visibility).toBe('Followers');
  });
});
