/**
 * Pure, side-effect-free logic for the TV Time blank-stubs rating deck (PR 4).
 *
 * Everything here is unit-tested and free of I/O: eligibility filtering, the
 * stars→stored-rating mapping, session chunking, the deck queue (eligible minus
 * locally-skipped), resume position, and the "inked of total" progress. The
 * service layer (deck-service.ts) does the Supabase reads/writes; the screen
 * stays thin.
 *
 * Extensibility (issue #682): a rating TARGET is modelled as `{ mediaType,
 * tmdbId }` so season/episode-level ratings can add fields later without
 * reshaping the deck. v1 targets whole movies and whole (finished) shows only.
 */

export type DeckMediaType = 'movie' | 'tv_show';

/** What a single card asks the user to rate. Extensible per issue #682. */
export interface RatingTarget {
  mediaType: DeckMediaType;
  tmdbId: number;
}

export interface DeckItem {
  /** Stable key `${mediaType}:${tmdbId}` — keys React state and de-dups. */
  key: string;
  target: RatingTarget;
  title: string;
  /** Release/first-air year (YYYY) for the card subtitle; null if unknown. */
  year: string | null;
  posterPath: string | null;
}

/** A raw imported-movie row (subset of user_movies) the eligibility read returns. */
export interface EligibleMovieRow {
  tmdb_id: number;
  title: string;
  release_date: string | null;
  poster_path: string | null;
}

/** A raw imported-show row (subset of user_tv_shows) the eligibility read returns. */
export interface EligibleShowRow {
  tmdb_id: number;
  name: string;
  first_air_date: string | null;
  poster_path: string | null;
}

/** Identifies an existing review so we can tell which targets are already rated. */
export interface RatedReviewKey {
  tmdb_id: number;
  media_type: string;
}

export interface DeckProgress {
  /** Imported items that CAN be inked (rated + still-unrated). */
  totalEligible: number;
  /** How many of those now carry a rating. */
  inked: number;
}

/** Items per session before the "keep going / later?" checkpoint. */
export const DECK_SESSION_SIZE = 10;

/** Stable per-item key for a rating target. */
export function deckItemKey(target: RatingTarget): string {
  return `${target.mediaType}:${target.tmdbId}`;
}

/** First 4 chars of a `YYYY-MM-DD` date if they read as a plausible year. */
export function yearFromDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const y = date.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

/**
 * Map a 1–5 star tap to the app's 1–10 stored rating (reviews.rating CHECK is
 * 1..10). An inked stub of N stars is stored identically to a slider review of
 * N*2, so it counts the same in rating stats. Clamps to the valid 1..5 domain.
 */
export function starsToReviewRating(stars: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  return clamped * 2;
}

/**
 * Build the deck's eligible-unrated items: imported watched movies + imported
 * finished shows that do NOT already have a review. Order is movies first (the
 * founder-locked "movies first" scope), each group in the order given.
 */
export function computeEligibleItems(
  movies: EligibleMovieRow[],
  shows: EligibleShowRow[],
  ratedKeys: RatedReviewKey[]
): DeckItem[] {
  const rated = new Set(
    ratedKeys.map((r) => `${r.media_type}:${r.tmdb_id}`)
  );

  const movieItems: DeckItem[] = movies
    .map((m): DeckItem => ({
      key: deckItemKey({ mediaType: 'movie', tmdbId: m.tmdb_id }),
      target: { mediaType: 'movie', tmdbId: m.tmdb_id },
      title: m.title,
      year: yearFromDate(m.release_date),
      posterPath: m.poster_path,
    }))
    .filter((it) => !rated.has(it.key));

  const showItems: DeckItem[] = shows
    .map((s): DeckItem => ({
      key: deckItemKey({ mediaType: 'tv_show', tmdbId: s.tmdb_id }),
      target: { mediaType: 'tv_show', tmdbId: s.tmdb_id },
      title: s.name,
      year: yearFromDate(s.first_air_date),
      posterPath: s.poster_path,
    }))
    .filter((it) => !rated.has(it.key));

  // De-dup by key defensively (a movie and show never collide — media prefix —
  // but rewatch rows could repeat a tmdb_id within user_movies).
  const seen = new Set<string>();
  return [...movieItems, ...showItems].filter((it) => {
    if (seen.has(it.key)) return false;
    seen.add(it.key);
    return true;
  });
}

/**
 * The queue the deck presents now: eligible-unrated items minus anything the
 * user skipped in a previous sitting (skips persist and are re-surfaceable
 * later by clearing the skip set). Order preserved.
 */
export function buildDeckQueue(
  eligible: DeckItem[],
  skippedKeys: ReadonlySet<string>
): DeckItem[] {
  return eligible.filter((it) => !skippedKeys.has(it.key));
}

/** Progress derived from counts: inked = eligible universe minus still-unrated. */
export function computeProgress(
  totalEligible: number,
  unratedCount: number
): DeckProgress {
  const inked = Math.max(0, totalEligible - unratedCount);
  return { totalEligible, inked };
}

export interface SessionSlot {
  /** 1-based position within the current 10-item session. */
  index: number;
  size: number;
}

/**
 * Position within the current session given how many cards have been decided
 * (rated or skipped) this sitting. Decisions 0..9 → slots 1..10, decision 10
 * wraps to slot 1 of the next session, etc.
 */
export function sessionSlot(decidedThisSession: number): SessionSlot {
  const n = Math.max(0, Math.floor(decidedThisSession));
  return { index: (n % DECK_SESSION_SIZE) + 1, size: DECK_SESSION_SIZE };
}

/**
 * True at a session boundary: after every DECK_SESSION_SIZE decisions, offer the
 * "keep going / later?" checkpoint (never at zero).
 */
export function isSessionCheckpoint(decidedThisSession: number): boolean {
  const n = Math.floor(decidedThisSession);
  return n > 0 && n % DECK_SESSION_SIZE === 0;
}
