import { searchMovies } from './movie-service';
import { captureException } from '@/lib/sentry';
import type { TMDBMovie } from './tmdb.types';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw ticket data extracted from Gemini AI
 * Matches the JSON schema used for ticket extraction
 */
export interface ExtractedTicket {
  movie_title: string | null;
  theater_name: string | null;
  theater_chain: string | null;
  showtime: string | null;
  date: string | null;
  seat_row: string | null;
  seat_number: string | null;
  ticket_type: string | null;
  price_amount: number | null;
  price_currency: string | null;
  format: string | null;
  confirmation_number: string | null;
  barcode_data: string | null;
  auditorium: string | null;
  bounding_box: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
  } | null;
}

/**
 * TMDB match result with confidence scoring
 */
export interface TMDBMatch {
  movie: TMDBMovie;
  confidence: number; // 0-1 score
  matchedTitle: string; // The title we searched for
  originalTitle: string; // The raw extracted title
}

/**
 * Processed ticket with cleaned data and TMDB match
 */
export interface ProcessedTicket {
  // Original extracted data (cleaned)
  movieTitle: string | null;
  theaterName: string | null;
  theaterChain: string | null;
  showtime: string | null;
  date: string | null;
  seatRow: string | null;
  seatNumber: string | null;
  ticketType: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  format: string | null;
  confirmationNumber: string | null;
  barcodeData: string | null;
  auditorium: string | null;

  // MPAA content rating (G, PG, PG-13, R, NC-17, NR)
  mpaaRating: string | null;

  // TMDB match (null if no match found)
  tmdbMatch: TMDBMatch | null;

  // Processing metadata
  processingErrors: string[];
  wasModified: boolean;

  // Local URI of cropped ticket photo (set by the scan hook after processing)
  ticketPhotoUri: string | null;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Format indicators to strip from movie titles
 * These are common theater format labels that appear in ticket titles
 */
const FORMAT_INDICATORS = [
  // Premium formats
  'DOLBY',
  'DOLBY CINEMA',
  'DOLBY ATMOS',
  'ATMOS',
  'IMAX',
  'IMAX 3D',
  'IMAX 2D',
  'IMAX LASER',
  'IMAX WITH LASER',
  // 3D variants
  '3D',
  '2D',
  'REAL 3D',
  'REALD 3D',
  'REALD',
  'DIGITAL 3D',
  // Other formats
  'SCREENX',
  'SCREEN X',
  '4DX',
  '4D',
  'D-BOX',
  'DBOX',
  'RPX',
  'XD',
  'ULTRA AVX',
  'AVX',
  'ETX',
  'PLF',
  'PRIME',
  'LUXE',
  'DIRECTOR\'S HALL',
  'VIP',
  'PREMIUM',
  // Theater-specific
  'AMC',
  'REGAL',
  'CINEMARK',
  'CINEPLEX',
  // Time-based
  'EARLY BIRD',
  'MATINEE',
  'LATE NIGHT',
  // Language variants
  'DUBBED',
  'SUBBED',
  'SUBTITLED',
  'ENGLISH',
  'SPANISH',
  'OV',
  'ORIGINAL VERSION',
];

/**
 * Common title prefixes to remove
 */
const TITLE_PREFIXES = [
  'MOVIE:',
  'FILM:',
  'FEATURE:',
  'SHOWING:',
];

/**
 * Common title suffixes to remove
 */
const TITLE_SUFFIXES = [
  '(MOVIE)',
  '(FILM)',
  '(FEATURE)',
];

// ============================================================================
// Title Cleaning Utilities
// ============================================================================

/**
 * Clean a raw movie title by removing format indicators and normalizing
 */
export function cleanMovieTitle(rawTitle: string): string {
  if (!rawTitle) return '';

  let title = rawTitle.trim();

  // Remove format indicators (case-insensitive)
  for (const format of FORMAT_INDICATORS) {
    // Match format at start, end, or surrounded by non-alphanumeric
    const patterns = [
      new RegExp(`^${escapeRegex(format)}\\s*[-:]?\\s*`, 'i'),
      new RegExp(`\\s*[-:]?\\s*${escapeRegex(format)}$`, 'i'),
      new RegExp(`\\s*\\(${escapeRegex(format)}\\)\\s*`, 'gi'),
      new RegExp(`\\s*\\[${escapeRegex(format)}\\]\\s*`, 'gi'),
      new RegExp(`\\s+${escapeRegex(format)}\\s+`, 'gi'),
    ];

    for (const pattern of patterns) {
      title = title.replace(pattern, ' ');
    }
  }

  // Remove common prefixes
  for (const prefix of TITLE_PREFIXES) {
    if (title.toUpperCase().startsWith(prefix)) {
      title = title.substring(prefix.length);
    }
  }

  // Remove common suffixes
  for (const suffix of TITLE_SUFFIXES) {
    if (title.toUpperCase().endsWith(suffix)) {
      title = title.substring(0, title.length - suffix.length);
    }
  }

  // Remove any remaining parenthetical format info
  title = title.replace(/\s*\([^)]*(?:3D|IMAX|DOLBY|ATMOS)[^)]*\)\s*/gi, ' ');

  // Normalize whitespace
  title = title.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing punctuation
  title = title.replace(/^[-:,.\s]+|[-:,.\s]+$/g, '');

  return title;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Seat Info Parsing
// ============================================================================

/**
 * Parse seat information from raw row and number strings
 * Handles cases like "H10" being row H, seat 10
 */
export function parseSeatInfo(
  rawRow: string | null,
  rawNumber: string | null
): { row: string | null; seat: string | null } {
  let row = rawRow?.trim() || null;
  let seat = rawNumber?.trim() || null;

  // Case 1: Row contains combined info like "H10" or "A-12"
  if (row && !seat) {
    const combinedMatch = row.match(/^([A-Za-z]+)[-\s]?(\d+)$/);
    if (combinedMatch) {
      row = combinedMatch[1].toUpperCase();
      seat = combinedMatch[2];
    }
  }

  // Case 2: Seat contains combined info
  if (seat && !row) {
    const combinedMatch = seat.match(/^([A-Za-z]+)[-\s]?(\d+)$/);
    if (combinedMatch) {
      row = combinedMatch[1].toUpperCase();
      seat = combinedMatch[2];
    }
  }

  // Case 3: Row is a number and seat is a letter (swapped)
  if (row && seat) {
    const rowIsNumber = /^\d+$/.test(row);
    const seatIsLetter = /^[A-Za-z]+$/.test(seat);

    if (rowIsNumber && seatIsLetter) {
      // They're swapped - fix it
      const temp = row;
      row = seat.toUpperCase();
      seat = temp;
    }
  }

  // Case 4: Check for format like "Row H Seat 10"
  if (row) {
    const rowMatch = row.match(/^(?:row\s+)?([A-Za-z]+)(?:\s+seat\s+(\d+))?$/i);
    if (rowMatch) {
      row = rowMatch[1].toUpperCase();
      if (rowMatch[2] && !seat) {
        seat = rowMatch[2];
      }
    }
  }

  // Normalize row to uppercase letter(s)
  if (row) {
    row = row.toUpperCase().replace(/[^A-Z]/g, '') || null;
  }

  // Normalize seat to just digits
  if (seat) {
    seat = seat.replace(/\D/g, '') || null;
  }

  return { row, seat };
}

// ============================================================================
// Date Validation
// ============================================================================

/**
 * Validate and fix malformed dates
 * Returns a valid YYYY-MM-DD string or null
 */
export function validateDate(
  dateStr: string | null,
  fallbackYear?: number
): string | null {
  if (!dateStr) return null;

  const currentYear = new Date().getFullYear();
  const yearToUse = fallbackYear ?? currentYear;

  // Clean the date string
  let cleaned = dateStr.trim();

  // Handle "null-MM-DD" format
  cleaned = cleaned.replace(/^null-/i, `${yearToUse}-`);

  // Handle various date formats
  const patterns = [
    // YYYY-MM-DD (standard)
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // DD/MM/YYYY (European)
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    // MM/DD (no year)
    /^(\d{1,2})\/(\d{1,2})$/,
    // Month DD, YYYY
    /^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?$/,
  ];

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  // Try YYYY-MM-DD first
  const isoMatch = cleaned.match(patterns[0]);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  }

  // Try MM/DD/YYYY
  if (!year) {
    const usMatch = cleaned.match(patterns[1]);
    if (usMatch) {
      month = parseInt(usMatch[1], 10);
      day = parseInt(usMatch[2], 10);
      year = parseInt(usMatch[3], 10);
    }
  }

  // Try MM-DD-YYYY
  if (!year) {
    const dashMatch = cleaned.match(patterns[2]);
    if (dashMatch) {
      month = parseInt(dashMatch[1], 10);
      day = parseInt(dashMatch[2], 10);
      year = parseInt(dashMatch[3], 10);
    }
  }

  // Try DD.MM.YYYY (European)
  if (!year) {
    const euMatch = cleaned.match(patterns[3]);
    if (euMatch) {
      day = parseInt(euMatch[1], 10);
      month = parseInt(euMatch[2], 10);
      year = parseInt(euMatch[3], 10);
    }
  }

  // Try MM/DD (no year)
  if (!year) {
    const noYearMatch = cleaned.match(patterns[4]);
    if (noYearMatch) {
      month = parseInt(noYearMatch[1], 10);
      day = parseInt(noYearMatch[2], 10);
      year = yearToUse;
    }
  }

  // Try Month DD, YYYY
  if (!year) {
    const monthNameMatch = cleaned.match(patterns[5]);
    if (monthNameMatch) {
      const monthName = monthNameMatch[1].toLowerCase();
      const monthNames: Record<string, number> = {
        january: 1, jan: 1,
        february: 2, feb: 2,
        march: 3, mar: 3,
        april: 4, apr: 4,
        may: 5,
        june: 6, jun: 6,
        july: 7, jul: 7,
        august: 8, aug: 8,
        september: 9, sep: 9, sept: 9,
        october: 10, oct: 10,
        november: 11, nov: 11,
        december: 12, dec: 12,
      };

      month = monthNames[monthName] ?? null;
      day = parseInt(monthNameMatch[2], 10);
      year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : yearToUse;
    }
  }

  // Validate the parsed date
  if (year && month && day) {
    // Basic validation
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;

    // More precise day validation
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return null;

    // Format as YYYY-MM-DD
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }

  return null;
}

// ============================================================================
// Price Normalization
// ============================================================================

/**
 * Normalize price data with default currency
 */
export function normalizePrice(
  amount: number | null,
  currency: string | null
): { amount: number | null; currency: string } {
  // Default currency to USD if not specified
  let normalizedCurrency = currency?.trim().toUpperCase() || 'USD';

  // Handle common currency symbols
  const currencyMap: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    'US$': 'USD',
    'US': 'USD',
    'DOLLAR': 'USD',
    'DOLLARS': 'USD',
    'EURO': 'EUR',
    'EUROS': 'EUR',
    'POUND': 'GBP',
    'POUNDS': 'GBP',
  };

  if (currencyMap[normalizedCurrency]) {
    normalizedCurrency = currencyMap[normalizedCurrency];
  }

  // Handle $0 prices as likely missing data
  let normalizedAmount = amount;
  if (amount === 0) {
    normalizedAmount = null;
  }

  return {
    amount: normalizedAmount,
    currency: normalizedCurrency,
  };
}

// ============================================================================
// TMDB Title Matching
// ============================================================================

/**
 * Calculate similarity between two strings (0-1)
 * Uses a simplified Levenshtein-based approach
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  // Check for containment
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    return shorter.length / longer.length;
  }

  // Calculate Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - distance / maxLength;
}

/**
 * Find the best TMDB match for an extracted movie title
 */
export async function findTMDBMatch(
  rawTitle: string
): Promise<TMDBMatch | null> {
  if (!rawTitle?.trim()) {
    return null;
  }

  // Clean the title first
  const cleanedTitle = cleanMovieTitle(rawTitle);

  if (!cleanedTitle) {
    return null;
  }

  try {
    // Search TMDB with the cleaned title
    const searchResult = await searchMovies(cleanedTitle, 1, 'title');

    if (!searchResult.movies || searchResult.movies.length === 0) {
      // Try searching with the original title as fallback
      const fallbackResult = await searchMovies(rawTitle.trim(), 1, 'title');

      if (!fallbackResult.movies || fallbackResult.movies.length === 0) {
        return null;
      }

      // Use first result from fallback
      const movie = fallbackResult.movies[0];
      const confidence = calculateSimilarity(rawTitle, movie.title);

      return {
        movie,
        confidence,
        matchedTitle: rawTitle.trim(),
        originalTitle: rawTitle,
      };
    }

    // Find the best match among results
    let bestMatch: TMDBMovie | null = null;
    let bestConfidence = 0;

    for (const movie of searchResult.movies.slice(0, 5)) {
      const confidence = calculateSimilarity(cleanedTitle, movie.title);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = movie;
      }

      // Also check against original title for edge cases
      const originalConfidence = calculateSimilarity(rawTitle, movie.title);
      if (originalConfidence > bestConfidence) {
        bestConfidence = originalConfidence;
        bestMatch = movie;
      }
    }

    if (!bestMatch) {
      return null;
    }

    return {
      movie: bestMatch,
      confidence: bestConfidence,
      matchedTitle: cleanedTitle,
      originalTitle: rawTitle,
    };
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'tmdb-match', rawTitle });
    return null;
  }
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Remove duplicate tickets based on confirmation number
 * Merges data if same ticket appears with different quality
 */
export function deduplicateTickets(
  tickets: ExtractedTicket[]
): ExtractedTicket[] {
  const ticketMap = new Map<string, ExtractedTicket>();
  const ticketsWithoutConfirmation: ExtractedTicket[] = [];

  for (const ticket of tickets) {
    const confirmationNumber = ticket.confirmation_number?.trim();

    if (!confirmationNumber) {
      // No confirmation number - can't dedupe, keep it
      ticketsWithoutConfirmation.push(ticket);
      continue;
    }

    const existing = ticketMap.get(confirmationNumber);

    if (!existing) {
      ticketMap.set(confirmationNumber, ticket);
      continue;
    }

    // Merge: prefer non-null values
    const merged: ExtractedTicket = {
      movie_title: existing.movie_title || ticket.movie_title,
      theater_name: existing.theater_name || ticket.theater_name,
      theater_chain: existing.theater_chain || ticket.theater_chain,
      showtime: existing.showtime || ticket.showtime,
      date: existing.date || ticket.date,
      seat_row: existing.seat_row || ticket.seat_row,
      seat_number: existing.seat_number || ticket.seat_number,
      ticket_type: existing.ticket_type || ticket.ticket_type,
      price_amount: existing.price_amount ?? ticket.price_amount,
      price_currency: existing.price_currency || ticket.price_currency,
      format: existing.format || ticket.format,
      confirmation_number: confirmationNumber,
      barcode_data: existing.barcode_data || ticket.barcode_data,
      auditorium: existing.auditorium || ticket.auditorium,
      bounding_box: existing.bounding_box ?? ticket.bounding_box ?? null,
    };

    ticketMap.set(confirmationNumber, merged);
  }

  // Combine deduped tickets with those that had no confirmation number
  return [...Array.from(ticketMap.values()), ...ticketsWithoutConfirmation];
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process raw extracted tickets into cleaned, enriched data
 */
export async function processExtractedTickets(
  rawTickets: ExtractedTicket[]
): Promise<ProcessedTicket[]> {
  // First, deduplicate
  const dedupedTickets = deduplicateTickets(rawTickets);

  // Process each ticket
  const processedTickets: ProcessedTicket[] = await Promise.all(
    dedupedTickets.map(async (ticket) => {
      const errors: string[] = [];
      let wasModified = false;

      // Clean movie title
      const cleanedTitle = ticket.movie_title
        ? cleanMovieTitle(ticket.movie_title)
        : null;

      if (cleanedTitle !== ticket.movie_title) {
        wasModified = true;
      }

      // Parse seat info
      const { row: seatRow, seat: seatNumber } = parseSeatInfo(
        ticket.seat_row,
        ticket.seat_number
      );

      if (seatRow !== ticket.seat_row || seatNumber !== ticket.seat_number) {
        wasModified = true;
      }

      // Validate date
      const validatedDate = validateDate(ticket.date);
      if (validatedDate !== ticket.date) {
        wasModified = true;
        if (ticket.date && !validatedDate) {
          errors.push(`Invalid date format: ${ticket.date}`);
        }
      }

      // Normalize price
      const { amount: priceAmount, currency: priceCurrency } = normalizePrice(
        ticket.price_amount,
        ticket.price_currency
      );

      // Find TMDB match
      let tmdbMatch: TMDBMatch | null = null;
      if (cleanedTitle) {
        try {
          tmdbMatch = await findTMDBMatch(ticket.movie_title || '');

          if (!tmdbMatch) {
            errors.push('No TMDB match found');
          } else if (tmdbMatch.confidence < 0.5) {
            errors.push(
              `Low confidence TMDB match (${Math.round(tmdbMatch.confidence * 100)}%)`
            );
          }
        } catch {
          errors.push('Failed to search TMDB');
        }
      }

      return {
        movieTitle: cleanedTitle,
        theaterName: ticket.theater_name?.trim() || null,
        theaterChain: ticket.theater_chain?.trim() || null,
        showtime: ticket.showtime?.trim() || null,
        date: validatedDate,
        seatRow,
        seatNumber,
        ticketType: ticket.ticket_type?.trim() || null,
        priceAmount,
        priceCurrency,
        format: ticket.format?.trim() || null,
        confirmationNumber: ticket.confirmation_number?.trim() || null,
        barcodeData: ticket.barcode_data?.trim() || null,
        auditorium: ticket.auditorium?.trim() || null,
        mpaaRating: null,
        tmdbMatch,
        processingErrors: errors,
        wasModified,
        ticketPhotoUri: null,
      };
    })
  );

  return processedTickets;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if a processed ticket has a high-confidence TMDB match
 */
export function hasConfidentMatch(
  ticket: ProcessedTicket,
  threshold: number = 0.7
): boolean {
  return ticket.tmdbMatch !== null && ticket.tmdbMatch.confidence >= threshold;
}

/**
 * Get tickets that need manual review (low confidence or errors)
 */
export function getTicketsNeedingReview(
  tickets: ProcessedTicket[]
): ProcessedTicket[] {
  return tickets.filter(
    (ticket) =>
      !hasConfidentMatch(ticket) ||
      ticket.processingErrors.length > 0
  );
}

/**
 * Get the TMDB movie from a processed ticket if available
 */
export function getTMDBMovieFromTicket(
  ticket: ProcessedTicket
): TMDBMovie | null {
  return ticket.tmdbMatch?.movie ?? null;
}
