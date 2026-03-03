import { supabase } from './supabase';

/** Represents a user's movie taste profile */
export interface TasteProfile {
  topGenres: { id: number; weight: number }[]; // Top 5 genres by frequency, weight = 0-1 normalized
  watchlistTmdbIds: Set<number>; // Direct watchlist matches (highest signal)
  totalWatched: number; // Used to determine profile maturity
}

/** Relevance score result */
export interface TasteScore {
  score: number; // 0-100
  label: string | null; // "Matches your taste" or null
}

/**
 * Compute a taste profile from the user's movie collection.
 * Analyzes genre frequency across watched + watchlisted movies.
 */
export async function computeTasteProfile(
  userId: string
): Promise<TasteProfile> {
  // Fetch all user movies with genre_ids
  const { data: movies } = await supabase
    .from('user_movies')
    .select('tmdb_id, genre_ids, status')
    .eq('user_id', userId);

  if (!movies || movies.length === 0) {
    return { topGenres: [], watchlistTmdbIds: new Set(), totalWatched: 0 };
  }

  // Count genre frequency (watched movies weighted 1.0, watchlist weighted 0.5)
  const genreCounts = new Map<number, number>();
  const watchlistIds = new Set<number>();
  let totalWatched = 0;

  for (const movie of movies) {
    if (movie.status === 'watchlist') {
      watchlistIds.add(movie.tmdb_id);
    }
    if (movie.status === 'watched') {
      totalWatched++;
    }

    const weight = movie.status === 'watched' ? 1.0 : 0.5;
    const genres = movie.genre_ids as number[] | null;
    if (genres) {
      for (const genreId of genres) {
        genreCounts.set(genreId, (genreCounts.get(genreId) || 0) + weight);
      }
    }
  }

  // Sort by count descending, take top 5
  const sorted = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Normalize weights to 0-1 range
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
  const topGenres = sorted.map(([id, count]) => ({
    id,
    weight: count / maxCount,
  }));

  return { topGenres, watchlistTmdbIds: watchlistIds, totalWatched };
}

/**
 * Score a release against the user's taste profile.
 * Returns a score 0-100 and an optional label.
 */
export function scoreRelease(
  movieGenreIds: number[],
  tmdbId: number,
  profile: TasteProfile
): TasteScore {
  // No profile = no scoring
  if (profile.totalWatched < 3) {
    return { score: 0, label: null };
  }

  // On watchlist = highest relevance (but we show that differently)
  if (profile.watchlistTmdbIds.has(tmdbId)) {
    return { score: 100, label: null }; // Watchlist badge shown separately
  }

  // Score based on genre overlap
  let genreScore = 0;
  if (movieGenreIds.length > 0 && profile.topGenres.length > 0) {
    for (const genreId of movieGenreIds) {
      const match = profile.topGenres.find((g) => g.id === genreId);
      if (match) {
        genreScore += match.weight;
      }
    }
    // Normalize: divide by number of genres in the movie, cap at 1
    genreScore = Math.min(genreScore / Math.min(movieGenreIds.length, 2), 1);
  }

  const finalScore = Math.round(genreScore * 100);

  return {
    score: finalScore,
    label: finalScore >= 50 ? 'Matches your taste' : null,
  };
}
