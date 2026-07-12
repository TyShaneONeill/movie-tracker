import {
  isTvTake,
  takeDisplayTitle,
  hasRating,
  formatRating,
  formatSeasonEpisode,
  scopeCounts,
  shouldShowScopeChips,
  filterTakesByScope,
  splitHeroAndRest,
} from '../../lib/first-takes-v2-logic';
import type { FirstTake } from '../../lib/database.types';

function take(overrides: Partial<FirstTake> = {}): FirstTake {
  return {
    id: overrides.id ?? 'id-1',
    user_id: 'u1',
    tmdb_id: 1,
    movie_title: 'Dune: Part Two',
    show_name: null,
    poster_path: '/p.jpg',
    reaction_emoji: '🤯',
    quote_text: 'A take.',
    rating: null,
    is_spoiler: false,
    is_rewatch: false,
    media_type: 'movie',
    season_number: null,
    episode_number: null,
    edited_at: null,
    like_count: null,
    comment_count: null,
    title: null,
    visibility: 'public',
    created_at: '2026-07-11T00:00:00Z',
    updated_at: null,
    ...overrides,
  } as FirstTake;
}

describe('isTvTake', () => {
  it('treats movie as not-TV and any other media_type as TV', () => {
    expect(isTvTake(take({ media_type: 'movie' }))).toBe(false);
    expect(isTvTake(take({ media_type: 'tv_show' }))).toBe(true);
    expect(isTvTake(take({ media_type: 'tv_season' }))).toBe(true);
    expect(isTvTake(take({ media_type: 'tv_episode' }))).toBe(true);
  });
});

describe('takeDisplayTitle', () => {
  it('prefers show_name (TV) and falls back to movie_title', () => {
    expect(takeDisplayTitle(take({ show_name: 'The Bear', movie_title: 'x' }))).toBe('The Bear');
    expect(takeDisplayTitle(take({ show_name: null, movie_title: 'Dune' }))).toBe('Dune');
    expect(takeDisplayTitle(take({ show_name: '   ', movie_title: 'Dune' }))).toBe('Dune');
  });
});

describe('hasRating — the rating-slot rule (Ty 2026-07-11)', () => {
  it('is true only for a real positive rating; null/0 leaves the slot empty', () => {
    expect(hasRating(take({ rating: 9 }))).toBe(true);
    expect(hasRating(take({ rating: 0.5 }))).toBe(true);
    expect(hasRating(take({ rating: null }))).toBe(false);
    expect(hasRating(take({ rating: 0 }))).toBe(false);
  });
});

describe('formatRating', () => {
  it('shows whole numbers bare and halves to one decimal', () => {
    expect(formatRating(9)).toBe('9');
    expect(formatRating(10)).toBe('10');
    expect(formatRating(8.5)).toBe('8.5');
  });
});

describe('formatSeasonEpisode — S·E only when the columns exist', () => {
  it('renders nothing without a season', () => {
    expect(formatSeasonEpisode(take({ season_number: null, episode_number: null }))).toBeNull();
    // episode without season is still nothing
    expect(formatSeasonEpisode(take({ season_number: null, episode_number: 7 }))).toBeNull();
  });
  it('renders S·E only when both are present, degrading to season-only', () => {
    expect(formatSeasonEpisode(take({ season_number: 2, episode_number: 7 }))).toBe('S2 · E7');
    expect(formatSeasonEpisode(take({ season_number: 2, episode_number: null }))).toBe('S2');
  });
});

describe('scopeCounts / shouldShowScopeChips', () => {
  const takes = [
    take({ id: 'a', media_type: 'movie' }),
    take({ id: 'b', media_type: 'movie' }),
    take({ id: 'c', media_type: 'tv_show' }),
  ];

  it('counts all / movie / tv', () => {
    expect(scopeCounts(takes)).toEqual({ all: 3, movie: 2, tv: 1 });
  });

  it('shows scope chips only when BOTH media types are present', () => {
    expect(shouldShowScopeChips(takes)).toBe(true);
    expect(shouldShowScopeChips([take({ media_type: 'movie' })])).toBe(false);
    expect(shouldShowScopeChips([take({ media_type: 'tv_show' })])).toBe(false);
    expect(shouldShowScopeChips([])).toBe(false);
  });
});

describe('filterTakesByScope', () => {
  const m1 = take({ id: 'm1', media_type: 'movie' });
  const m2 = take({ id: 'm2', media_type: 'movie' });
  const t1 = take({ id: 't1', media_type: 'tv_show' });
  const takes = [m1, t1, m2];

  it('all → unchanged (preserves order)', () => {
    expect(filterTakesByScope(takes, 'all')).toEqual([m1, t1, m2]);
  });
  it('movie → only movies', () => {
    expect(filterTakesByScope(takes, 'movie')).toEqual([m1, m2]);
  });
  it('tv → only TV', () => {
    expect(filterTakesByScope(takes, 'tv')).toEqual([t1]);
  });
});

describe('splitHeroAndRest', () => {
  it('takes the first (latest) as hero and the remainder as rest', () => {
    expect(splitHeroAndRest([1, 2, 3])).toEqual({ hero: 1, rest: [2, 3] });
  });
  it('handles a single take and an empty list', () => {
    expect(splitHeroAndRest([1])).toEqual({ hero: 1, rest: [] });
    expect(splitHeroAndRest([])).toEqual({ hero: null, rest: [] });
  });
});
