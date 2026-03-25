import Papa from 'papaparse';
import { searchMovies, addMovieToLibrary, fetchUserMovies } from './movie-service';
import { supabase } from './supabase';
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

export function detectLetterboxdCSVType(csvContent: string): LetterboxdCSVType {
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
      const userMovie = await addMovieToLibrary(userId, match.tmdbMovie, status);

      // Update watched_at if available from the Letterboxd entry
      if (match.entry.watchedDate) {
        await supabase
          .from('user_movies')
          .update({ watched_at: match.entry.watchedDate })
          .eq('id', userMovie.id);
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
