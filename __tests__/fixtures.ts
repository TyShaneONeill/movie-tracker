/**
 * Shared test fixtures - DRY helpers for all test files
 */

import type { ExtractedTicket, ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';

// ============================================================================
// TMDB Movie Fixtures
// ============================================================================

export function makeTMDBMovie(overrides: Record<string, unknown> = {}) {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-Loss-of-identity tale.',
    poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg',
    backdrop_path: '/87hTDiay2N2qWyX4Ds7ybXi9h8I.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
    popularity: 50.0,
    vote_count: 25000,
    adult: false,
    original_language: 'en',
    original_title: 'Fight Club',
    video: false,
    ...overrides,
  };
}

// ============================================================================
// Ticket Fixtures
// ============================================================================

export function makeExtractedTicket(
  overrides: Partial<ExtractedTicket> = {}
): ExtractedTicket {
  return {
    movie_title: 'The Dark Knight',
    theater_name: 'AMC Metreon',
    theater_chain: 'AMC',
    showtime: '7:30 PM',
    date: '2024-03-15',
    seat_row: 'H',
    seat_number: '10',
    ticket_type: 'Adult',
    price_amount: 16.99,
    price_currency: 'USD',
    format: 'IMAX',
    confirmation_number: 'ABC123',
    barcode_data: null,
    auditorium: '7',
    ...overrides,
  };
}

export function makeProcessedTicket(
  overrides: Partial<ProcessedTicket> = {}
): ProcessedTicket {
  return {
    movieTitle: 'The Dark Knight',
    theaterName: 'AMC Metreon',
    theaterChain: 'AMC',
    showtime: '7:30 PM',
    date: '2024-03-15',
    seatRow: 'H',
    seatNumber: '10',
    ticketType: 'Adult',
    priceAmount: 16.99,
    priceCurrency: 'USD',
    format: 'IMAX',
    confirmationNumber: 'ABC123',
    barcodeData: null,
    auditorium: '7',
    mpaaRating: null,
    tmdbMatch: null,
    processingErrors: [],
    wasModified: false,
    ...overrides,
  };
}

export function makeTMDBMatch(
  overrides: Partial<TMDBMatch> = {}
): TMDBMatch {
  return {
    movie: makeTMDBMovie() as any,
    confidence: 0.95,
    matchedTitle: 'Fight Club',
    originalTitle: 'Fight Club',
    ...overrides,
  };
}

// ============================================================================
// Supabase Mock Helpers
// ============================================================================

/**
 * Create a mock Supabase query builder chain.
 * Usage: const mock = mockSupabaseQuery({ data: [...], error: null });
 */
export function mockSupabaseQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};

  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'is', 'in', 'not',
    'order', 'limit', 'range',
    'single', 'maybeSingle',
    'filter', 'match', 'or', 'and',
  ];

  for (const method of methods) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }

  // Terminal methods return the result
  chain['single'] = jest.fn().mockResolvedValue(result);
  chain['maybeSingle'] = jest.fn().mockResolvedValue(result);

  // Make the chain itself act as a promise for non-terminal queries
  (chain as any).then = (resolve: (value: unknown) => void) => resolve(result);

  return chain;
}

/**
 * Create a mock for supabase.functions.invoke
 */
export function mockFunctionsInvoke(result: { data: unknown; error: unknown }) {
  return jest.fn().mockResolvedValue(result);
}

// ============================================================================
// External Ratings Fixtures
// ============================================================================

export function makeRatingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    ratings: {
      imdb: { rating: 8.8, votes: 2500000 },
      rottenTomatoes: { score: 94 },
      metacritic: { score: 84 },
    },
    source: 'omdb' as const,
    ...overrides,
  };
}
