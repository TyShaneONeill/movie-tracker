import Papa from 'papaparse';
import { searchMovies, addMovieToLibrary, fetchUserMovies } from './movie-service';
import { supabase } from './supabase';
import { captureMessage } from './sentry';
import type { TMDBMovie } from './tmdb.types';
import type { MovieStatus } from './database.types';

// Types
export interface LetterboxdEntry {
  name: string;
  year: number | null;
  watchedDate: string | null; // YYYY-MM-DD
  rating: number | null; // 0.5-5.0 scale
  isRewatch: boolean;
  letterboxdUri: string | null;
}

export interface MatchedMovie {
  entry: LetterboxdEntry;
  tmdbMovie: TMDBMovie | null;
  status: 'matched' | 'unmatched' | 'duplicate' | 'imported';
}

export interface ImportProgress {
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  imported: number;
  current: number;
  // Movies whose write resolved successfully in importMovies() but were not
  // found in a post-import reconciliation read — i.e. success theater (#812).
  // Already subtracted out of `imported`.
  persistenceFailed: number;
}

// Letterboxd CSV column names
interface LetterboxdCSVRow {
  Date?: string;
  Name?: string;
  Year?: string;
  'Letterboxd URI'?: string;
  Rating?: string;
  Rewatch?: string;
  Tags?: string;
  'Watched Date'?: string;
}

export type LetterboxdCSVType = 'watched' | 'diary' | 'ratings' | 'watchlist' | 'unknown';

/** Thrown by detectLetterboxdCSVType/parseLetterboxdCSV when given non-string
 *  input — e.g. a native file read that failed silently and resolved to
 *  undefined — instead of letting papaparse dereference it into an opaque
 *  TypeError (Sentry REACT-NATIVE-POCKETSTUBS-4G). */
export class LetterboxdCSVNotStringError extends Error {
  constructor() {
    super('letterboxd-csv-not-string');
    this.name = 'LetterboxdCSVNotStringError';
  }
}

export function detectLetterboxdCSVType(csvContent: string): LetterboxdCSVType {
  if (typeof csvContent !== 'string') {
    throw new LetterboxdCSVNotStringError();
  }
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    preview: 1,
  });
  const headers = result.meta.fields ?? [];

  if (headers.includes('Watched Date') && headers.includes('Rewatch')) return 'diary';
  if (headers.includes('Rating') && !headers.includes('Watched Date')) return 'ratings';
  if (headers.includes('Name') && !headers.includes('Rating') && !headers.includes('Watched Date')) {
    return headers.includes('Date') ? 'watched' : 'unknown';
  }
  return 'unknown';
}

/**
 * Parse Letterboxd CSV content into structured entries.
 * Supports watched.csv (Date, Name, Year, Letterboxd URI) and
 * diary.csv (Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date).
 */
export function parseLetterboxdCSV(csvContent: string): LetterboxdEntry[] {
  if (typeof csvContent !== 'string') {
    throw new LetterboxdCSVNotStringError();
  }
  const result = Papa.parse<LetterboxdCSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .filter((row) => row.Name && row.Name.trim().length > 0)
    .map((row) => {
      const yearParsed = row.Year ? parseInt(row.Year, 10) : null;
      const ratingParsed = row.Rating ? parseFloat(row.Rating) : null;

      return {
        name: row.Name!.trim(),
        year: yearParsed && !isNaN(yearParsed) ? yearParsed : null,
        watchedDate: (row['Watched Date']?.trim() || row.Date?.trim()) ?? null,
        rating: ratingParsed && !isNaN(ratingParsed) ? ratingParsed : null,
        isRewatch: row.Rewatch?.trim() === 'Yes',
        letterboxdUri: row['Letterboxd URI']?.trim() || null,
      };
    });
}

/**
 * Match Letterboxd entries to TMDB movies.
 * Searches TMDB for each entry and finds the best match by year.
 * Includes a 100ms delay between searches to avoid rate limiting.
 */
export async function matchMoviesToTMDB(
  entries: LetterboxdEntry[],
  onProgress?: (progress: ImportProgress) => void
): Promise<MatchedMovie[]> {
  const matches: MatchedMovie[] = [];
  const progress: ImportProgress = {
    total: entries.length,
    matched: 0,
    unmatched: 0,
    duplicates: 0,
    imported: 0,
    current: 0,
    persistenceFailed: 0,
  };

  for (const entry of entries) {
    try {
      const response = await searchMovies(entry.name);
      let bestMatch: TMDBMovie | null = null;

      if (response.movies.length > 0) {
        if (entry.year) {
          // Try to find a movie with a matching release year
          bestMatch =
            response.movies.find((movie) => {
              const movieYear = parseInt(
                movie.release_date?.split('-')[0] || '',
                10
              );
              return movieYear === entry.year;
            }) || null;
        }

        // Fall back to first result if no year match
        if (!bestMatch) {
          bestMatch = response.movies[0];
        }
      }

      if (bestMatch) {
        matches.push({ entry, tmdbMovie: bestMatch, status: 'matched' });
        progress.matched++;
      } else {
        matches.push({ entry, tmdbMovie: null, status: 'unmatched' });
        progress.unmatched++;
      }
    } catch {
      matches.push({ entry, tmdbMovie: null, status: 'unmatched' });
      progress.unmatched++;
    }

    progress.current++;
    onProgress?.({ ...progress });

    // Rate limiting delay between searches
    await new Promise((r) => setTimeout(r, 100));
  }

  return matches;
}

/**
 * Import matched movies into the user's collection.
 * Skips unmatched entries and handles duplicate detection.
 * Sets watched_at date if available from the Letterboxd entry.
 */
export async function importMovies(
  userId: string,
  matches: MatchedMovie[],
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const progress: ImportProgress = {
    total: matches.length,
    matched: 0,
    unmatched: 0,
    duplicates: 0,
    imported: 0,
    current: 0,
    persistenceFailed: 0,
  };

  for (const match of matches) {
    if (match.status === 'unmatched' || !match.tmdbMovie) {
      progress.unmatched++;
      progress.current++;
      match.status = 'unmatched';
      onProgress?.({ ...progress });
      continue;
    }

    try {
      const status: MovieStatus = 'watched';
      const userMovie = await addMovieToLibrary(userId, match.tmdbMovie, status, { skipEnrich: true });

      // Update watched_at if available from the Letterboxd entry. Enrichment
      // only — the row itself was already written by addMovieToLibrary above,
      // so a failure here shouldn't fail the import, just be visible.
      if (match.entry.watchedDate) {
        const { error: watchedAtError } = await supabase
          .from('user_movies')
          .update({ watched_at: match.entry.watchedDate })
          .eq('id', userMovie.id);
        if (watchedAtError) {
          captureMessage('letterboxd-import-watched-at-update-failed', {
            tmdbId: match.tmdbMovie.id,
          });
        }
      }

      match.status = 'imported';
      progress.imported++;
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE') {
        match.status = 'duplicate';
        progress.duplicates++;
      } else {
        // Treat other errors as unmatched for progress tracking
        match.status = 'unmatched';
        progress.unmatched++;
      }
    }

    progress.current++;
    onProgress?.({ ...progress });
  }

  // Reconciliation (#812): addMovieToLibrary's upsert can resolve successfully
  // in the JS layer without the corresponding Postgres write ever landing —
  // a client/session-level failure mode confirmed NOT reproducible at the
  // prod API/schema/RLS layer, so we verify rather than trust resolution.
  // One query for the whole batch, not per-row.
  const claimed = matches.filter(
    (m): m is MatchedMovie & { tmdbMovie: TMDBMovie } => m.status === 'imported' && m.tmdbMovie !== null
  );
  if (claimed.length > 0) {
    const claimedTmdbIds = claimed.map((m) => m.tmdbMovie.id);
    const { data: persistedRows, error: reconcileError } = await supabase
      .from('user_movies')
      .select('tmdb_id')
      .eq('user_id', userId)
      .in('tmdb_id', claimedTmdbIds);

    // If the reconciliation read itself fails, we can't tell "didn't persist"
    // from "couldn't verify" — don't downgrade claimed imports on a network
    // blip in the verification step.
    if (!reconcileError && persistedRows) {
      const persistedIds = new Set((persistedRows as { tmdb_id: number }[]).map((r) => r.tmdb_id));

      for (const match of claimed) {
        if (!persistedIds.has(match.tmdbMovie.id)) {
          match.status = 'unmatched';
          progress.imported--;
          progress.persistenceFailed++;
        }
      }

      if (progress.persistenceFailed > 0) {
        captureMessage('letterboxd-import-reconciliation-mismatch', {
          claimed: claimed.length,
          persisted: persistedIds.size,
        });
      }
    }
  }

  return progress;
}

// First take row shape for export join
interface FirstTakeForExport {
  tmdb_id: number;
  rating: number | null;
  quote_text: string;
}

/**
 * Export the user's movie collection as a CSV string.
 * Includes first take ratings and reviews when available.
 * CSV columns: Title, Year, Rating, Watched Date, Review
 */
export async function exportCollectionCSV(userId: string): Promise<string> {
  // Fetch all user movies
  const userMovies = await fetchUserMovies(userId);

  // Fetch first takes for the user to join ratings and reviews
  const { data: firstTakes } = await supabase
    .from('first_takes')
    .select('tmdb_id, rating, quote_text')
    .eq('user_id', userId);

  // Build a lookup map of first takes by tmdb_id
  const firstTakeMap = new Map<number, FirstTakeForExport>();
  if (firstTakes) {
    for (const ft of firstTakes) {
      firstTakeMap.set(ft.tmdb_id, ft);
    }
  }

  // Build CSV data rows
  const csvData = userMovies.map((movie) => {
    const year = movie.release_date
      ? movie.release_date.split('-')[0]
      : '';
    const firstTake = firstTakeMap.get(movie.tmdb_id);
    const rating = firstTake?.rating ?? '';
    const watchedDate = movie.watched_at
      ? movie.watched_at.split('T')[0]
      : '';
    const review = firstTake?.quote_text ?? '';

    return {
      Title: movie.title,
      Year: year,
      Rating: rating,
      'Watched Date': watchedDate,
      Review: review,
    };
  });

  return Papa.unparse(csvData);
}
