import {
  computeEligibleItems,
  buildDeckQueue,
  computeProgress,
  clampDeckRating,
  sessionSlot,
  isSessionCheckpoint,
  deckItemKey,
  yearFromDate,
  buildTakeKeySet,
  shouldOfferTakeBridge,
  DECK_SESSION_SIZE,
  type EligibleMovieRow,
  type EligibleShowRow,
  type RatedReviewKey,
  type ExistingTakeKey,
} from '@/lib/tvtime-deck/deck-logic';

const movie = (tmdb_id: number, title = `Movie ${tmdb_id}`): EligibleMovieRow => ({
  tmdb_id,
  title,
  release_date: '2019-10-04',
  poster_path: `/p${tmdb_id}.jpg`,
});

const show = (tmdb_id: number, name = `Show ${tmdb_id}`): EligibleShowRow => ({
  tmdb_id,
  name,
  first_air_date: '2011-04-17',
  poster_path: `/s${tmdb_id}.jpg`,
});

describe('clampDeckRating (1–10 slider value, stored as an integer)', () => {
  it('passes whole 1–10 values through unchanged', () => {
    expect(clampDeckRating(1)).toBe(1);
    expect(clampDeckRating(8)).toBe(8);
    expect(clampDeckRating(10)).toBe(10);
  });

  it('ROUNDS fractional slider values to an integer (#722)', () => {
    // reviews.rating is an integer column; PostgREST rejects a fractional value
    // with 22P02 (it text-casts, it does not round), so a fractional rating must
    // be rounded before the write or the insert fails and the rating is lost.
    expect(clampDeckRating(7.5)).toBe(8);
    expect(clampDeckRating(7.4)).toBe(7);
    expect(clampDeckRating(8.3)).toBe(8);
    expect(Number.isInteger(clampDeckRating(6.7))).toBe(true);
  });

  it('clamps out-of-range values into 1..10', () => {
    expect(clampDeckRating(0)).toBe(1);
    expect(clampDeckRating(0.4)).toBe(1);
    expect(clampDeckRating(11)).toBe(10);
    expect(clampDeckRating(-3)).toBe(1);
  });
});

describe('yearFromDate', () => {
  it('extracts a 4-digit year', () => {
    expect(yearFromDate('2019-10-04')).toBe('2019');
  });
  it('returns null for empty/invalid', () => {
    expect(yearFromDate(null)).toBeNull();
    expect(yearFromDate('')).toBeNull();
    expect(yearFromDate('n/a')).toBeNull();
  });
});

describe('computeEligibleItems (movies + finished shows, unrated only)', () => {
  it('includes imported watched movies and shows lacking a review', () => {
    const items = computeEligibleItems([movie(1), movie(2)], [show(9)], []);
    expect(items.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'tv_show:9']);
  });

  it('orders movies before shows (founder-locked "movies first")', () => {
    const items = computeEligibleItems([movie(1)], [show(9)], []);
    expect(items[0].target.mediaType).toBe('movie');
    expect(items[items.length - 1].target.mediaType).toBe('tv_show');
  });

  it('excludes items that already have a review of the same media type', () => {
    const rated: RatedReviewKey[] = [
      { tmdb_id: 1, media_type: 'movie' },
      { tmdb_id: 9, media_type: 'tv_show' },
    ];
    const items = computeEligibleItems([movie(1), movie(2)], [show(9)], rated);
    expect(items.map((i) => i.key)).toEqual(['movie:2']);
  });

  it('does not let a movie review mask a same-id show (media type distinguishes)', () => {
    const rated: RatedReviewKey[] = [{ tmdb_id: 5, media_type: 'movie' }];
    const items = computeEligibleItems([movie(5)], [show(5)], rated);
    // movie:5 rated → excluded; tv_show:5 still eligible
    expect(items.map((i) => i.key)).toEqual(['tv_show:5']);
  });

  it('de-dups repeated tmdb ids within a source (rewatch rows)', () => {
    const items = computeEligibleItems([movie(1), movie(1)], [], []);
    expect(items.map((i) => i.key)).toEqual(['movie:1']);
  });

  it('maps year and poster onto the item', () => {
    const [it] = computeEligibleItems([movie(7, 'Joker')], [], []);
    expect(it).toMatchObject({ title: 'Joker', year: '2019', posterPath: '/p7.jpg' });
    expect(deckItemKey(it.target)).toBe('movie:7');
  });
});

describe('buildDeckQueue (exclude locally-skipped)', () => {
  it('removes skipped items but keeps order', () => {
    const eligible = computeEligibleItems([movie(1), movie(2), movie(3)], [], []);
    const queue = buildDeckQueue(eligible, new Set(['movie:2']));
    expect(queue.map((i) => i.key)).toEqual(['movie:1', 'movie:3']);
  });

  it('returns everything when nothing is skipped', () => {
    const eligible = computeEligibleItems([movie(1)], [], []);
    expect(buildDeckQueue(eligible, new Set())).toHaveLength(1);
  });
});

describe('computeProgress (inked of total)', () => {
  it('inked = total minus still-unrated', () => {
    expect(computeProgress(612, 575)).toEqual({ totalEligible: 612, inked: 37 });
  });
  it('never goes negative', () => {
    expect(computeProgress(3, 5).inked).toBe(0);
  });
  it('all rated → fully inked', () => {
    expect(computeProgress(10, 0)).toEqual({ totalEligible: 10, inked: 10 });
  });
});

describe('session chunking + checkpoints', () => {
  it('slots decisions 0..9 into positions 1..10 of a 10-item session', () => {
    expect(sessionSlot(0)).toEqual({ index: 1, size: DECK_SESSION_SIZE });
    expect(sessionSlot(7)).toEqual({ index: 8, size: DECK_SESSION_SIZE });
    expect(sessionSlot(9)).toEqual({ index: 10, size: DECK_SESSION_SIZE });
  });

  it('wraps into the next session after 10 decisions', () => {
    expect(sessionSlot(10)).toEqual({ index: 1, size: DECK_SESSION_SIZE });
    expect(sessionSlot(23)).toEqual({ index: 4, size: DECK_SESSION_SIZE });
  });

  it('fires a checkpoint every 10 decisions but never at zero', () => {
    expect(isSessionCheckpoint(0)).toBe(false);
    expect(isSessionCheckpoint(9)).toBe(false);
    expect(isSessionCheckpoint(10)).toBe(true);
    expect(isSessionCheckpoint(20)).toBe(true);
    expect(isSessionCheckpoint(25)).toBe(false);
  });
});

describe('per-item state transitions (rate / skip mirror the read model)', () => {
  it('a rated item drops from the next eligibility read; a skip is applied client-side', () => {
    // Round 1: 3 eligible, none decided.
    let eligible = computeEligibleItems([movie(1), movie(2), movie(3)], [], []);
    let queue = buildDeckQueue(eligible, new Set());
    expect(queue.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'movie:3']);

    // User rates movie:1 (server now has a review) and skips movie:2 (client set).
    const rated: RatedReviewKey[] = [{ tmdb_id: 1, media_type: 'movie' }];
    const skipped = new Set(['movie:2']);

    // Round 2 (e.g. after app reopen): eligibility re-derives, skip set persists.
    eligible = computeEligibleItems([movie(1), movie(2), movie(3)], [], rated);
    queue = buildDeckQueue(eligible, skipped);
    expect(queue.map((i) => i.key)).toEqual(['movie:3']); // resumes exactly

    // Clearing skips re-surfaces movie:2.
    queue = buildDeckQueue(eligible, new Set());
    expect(queue.map((i) => i.key)).toEqual(['movie:2', 'movie:3']);
  });
});

describe('ink→take bridge dedup (buildTakeKeySet + shouldOfferTakeBridge)', () => {
  const takes = (...rows: ExistingTakeKey[]) => buildTakeKeySet(rows);

  it('builds `${media_type}:${tmdb_id}` keys that line up with deck item keys', () => {
    const keys = takes(
      { tmdb_id: 1, media_type: 'movie' },
      { tmdb_id: 2, media_type: 'tv_show' }
    );
    expect(keys.has('movie:1')).toBe(true);
    expect(keys.has('tv_show:2')).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('empty take set → offers the bridge for every freshly inked item', () => {
    const keys = takes();
    expect(shouldOfferTakeBridge('movie:1', keys)).toBe(true);
    expect(shouldOfferTakeBridge('tv_show:9', keys)).toBe(true);
  });

  it('suppresses the bridge for a title the user already has a take on', () => {
    const keys = takes({ tmdb_id: 1, media_type: 'movie' });
    expect(shouldOfferTakeBridge('movie:1', keys)).toBe(false); // already spoken for
    expect(shouldOfferTakeBridge('movie:2', keys)).toBe(true); // different title
  });

  it('a movie take does not suppress the same tmdb_id as a show, and vice versa', () => {
    const keys = takes({ tmdb_id: 42, media_type: 'movie' });
    expect(shouldOfferTakeBridge('movie:42', keys)).toBe(false);
    expect(shouldOfferTakeBridge('tv_show:42', keys)).toBe(true); // distinct target
  });

  it('an episode/season take never collides with a show-level deck key', () => {
    // Deck keys are only ever 'movie:'/'tv_show:'; an episode take produces a key
    // that never matches, so the show-level bridge still shows (intended).
    const keys = takes(
      { tmdb_id: 7, media_type: 'tv_episode' },
      { tmdb_id: 7, media_type: 'tv_season' }
    );
    expect(shouldOfferTakeBridge('tv_show:7', keys)).toBe(true);
  });
});
