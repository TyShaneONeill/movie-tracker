/**
 * Data layer for the TV Time blank-stubs rating deck (PR 4).
 *
 * Reads the eligibility universe and writes a quiet rating. Pure filtering /
 * mapping lives in deck-logic.ts; this module only touches Supabase.
 *
 * Eligibility (founder-locked v1 scope):
 *  - imported movies watched without a rating
 *    (user_movies.status = 'watched' AND source = 'tvtime_import', no review)
 *  - imported shows finished as a whole, without a rating
 *    (user_tv_shows.status = 'watched', the show has at least one imported
 *    episode, and no review)
 * Partially-watched shows are excluded (issue #682 tracks season/episode
 * ratings). Two schema facts drive the show query:
 *  - the DB show-status enum is 'watched' (there is no 'completed');
 *  - #683 added `source` to user_movies + user_episode_watches but NOT to
 *    user_tv_shows, so import provenance for a show lives on its episodes. We
 *    treat a show as imported iff it has an episode with source='tvtime_import'.
 */

import { supabase } from '@/lib/supabase';
import { createReview } from '@/lib/review-service';
import {
  computeEligibleItems,
  computeProgress,
  starsToReviewRating,
  type DeckItem,
  type DeckProgress,
  type EligibleMovieRow,
  type EligibleShowRow,
  type RatedReviewKey,
} from './deck-logic';

export interface DeckData {
  /** Eligible items that still need a rating (movies first). */
  eligible: DeckItem[];
  progress: DeckProgress;
}

/**
 * Load the deck: imported watched movies + finished shows lacking a rating,
 * plus overall inked/total progress. One read per source table + one read of
 * the user's review keys (a user has at most a few hundred reviews).
 */
export async function fetchDeckData(userId: string): Promise<DeckData> {
  const [moviesRes, showsRes, importedEpRes, reviewsRes] = await Promise.all([
    supabase
      .from('user_movies')
      .select('tmdb_id, title, release_date, poster_path')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .eq('source', 'tvtime_import'),
    // user_tv_shows has no `source` column (#683 only added it to user_movies +
    // user_episode_watches); finished shows are filtered to imported ones below.
    supabase
      .from('user_tv_shows')
      .select('tmdb_id, name, first_air_date, poster_path')
      .eq('user_id', userId)
      .eq('status', 'watched'),
    // Show tmdb ids the user has at least one IMPORTED episode for = imported shows.
    supabase
      .from('user_episode_watches')
      .select('tmdb_show_id')
      .eq('user_id', userId)
      .eq('source', 'tvtime_import'),
    supabase
      .from('reviews')
      .select('tmdb_id, media_type')
      .eq('user_id', userId),
  ]);

  if (moviesRes.error) throw moviesRes.error;
  if (showsRes.error) throw showsRes.error;
  if (importedEpRes.error) throw importedEpRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const importedShowIds = new Set(
    ((importedEpRes.data ?? []) as { tmdb_show_id: number }[]).map((r) => r.tmdb_show_id)
  );

  const movies = (moviesRes.data ?? []) as EligibleMovieRow[];
  const shows = ((showsRes.data ?? []) as EligibleShowRow[]).filter((s) =>
    importedShowIds.has(s.tmdb_id)
  );
  const ratedKeys = (reviewsRes.data ?? []) as RatedReviewKey[];

  const eligible = computeEligibleItems(movies, shows, ratedKeys);
  const totalEligible = movies.length + shows.length;
  const progress = computeProgress(totalEligible, eligible.length);

  return { eligible, progress };
}

/**
 * Ink one blank stub: write the rating as a QUIET review (source =
 * 'tvtime_import', private, no words). Stored identically to a slider review of
 * the same value (stars*2 on the 1–10 scale) — so it has exact PARITY with an
 * organic review-rating (both show as "your rating" on the title detail;
 * neither feeds rating personality, which reads first_takes). The DB trigger
 * skips follower notifications and the feed / Reviews tab / weekly-recap /
 * Critic count exclude it. A pre-existing review (already inked, or rated
 * organically) is treated as success — the deck simply advances.
 */
export async function inkStubRating(
  userId: string,
  item: DeckItem,
  stars: number
): Promise<void> {
  try {
    await createReview(userId, {
      tmdbId: item.target.tmdbId,
      mediaType: item.target.mediaType,
      movieTitle: item.title,
      posterPath: item.posterPath,
      title: '',
      reviewText: '',
      rating: starsToReviewRating(stars),
      isSpoiler: false,
      isRewatch: false,
      visibility: 'private',
      source: 'tvtime_import',
    });
  } catch (err) {
    // Idempotent: the (user_id, tmdb_id, media_type) unique constraint means an
    // already-rated item throws DUPLICATE_REVIEW — that's a no-op success here.
    if (err instanceof Error && err.message === 'DUPLICATE_REVIEW') return;
    throw err;
  }
}
