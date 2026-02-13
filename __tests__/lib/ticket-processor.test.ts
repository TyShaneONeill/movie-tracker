import {
  cleanMovieTitle,
  parseSeatInfo,
  validateDate,
  normalizePrice,
  deduplicateTickets,
  hasConfidentMatch,
  getTicketsNeedingReview,
  getTMDBMovieFromTicket,
  findTMDBMatch,
} from '@/lib/ticket-processor';
import {
  makeExtractedTicket,
  makeProcessedTicket,
  makeTMDBMatch,
  makeTMDBMovie,
} from '../fixtures';

// Mock movie-service for findTMDBMatch tests
jest.mock('@/lib/movie-service', () => ({
  searchMovies: jest.fn(),
}));

import { searchMovies } from '@/lib/movie-service';

const mockSearchMovies = searchMovies as jest.MockedFunction<typeof searchMovies>;

// ============================================================================
// cleanMovieTitle
// ============================================================================

describe('cleanMovieTitle', () => {
  describe('empty/null input', () => {
    it('returns empty string for empty string', () => {
      expect(cleanMovieTitle('')).toBe('');
    });

    it('returns empty string for whitespace-only string', () => {
      expect(cleanMovieTitle('   ')).toBe('');
    });
  });

  describe('stripping format indicators', () => {
    it.each([
      ['IMAX The Batman', 'The Batman'],
      ['The Batman IMAX', 'The Batman'],
      ['The Batman (IMAX)', 'The Batman'],
      ['The Batman [IMAX]', 'The Batman'],
    ])('strips IMAX from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });

    it.each([
      ['3D Dune Part Two', 'Dune Part Two'],
      ['Dune Part Two 3D', 'Dune Part Two'],
      ['Dune Part Two (3D)', 'Dune Part Two'],
      ['Dune Part Two [REALD 3D]', 'Dune Part Two'],
    ])('strips 3D variants from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });

    it.each([
      ['DOLBY Oppenheimer', 'Oppenheimer'],
      ['Oppenheimer DOLBY ATMOS', 'Oppenheimer'],
      ['Oppenheimer (DOLBY CINEMA)', 'Oppenheimer'],
    ])('strips DOLBY variants from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });

    it.each([
      ['4DX Deadpool', 'Deadpool'],
      ['Deadpool SCREENX', 'Deadpool'],
      ['Deadpool (D-BOX)', 'Deadpool'],
      ['RPX Deadpool', 'Deadpool'],
    ])('strips other formats from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });

    it('strips multiple format indicators', () => {
      expect(cleanMovieTitle('IMAX 3D The Batman DOLBY')).toBe('The Batman');
    });

    it('is case-insensitive', () => {
      expect(cleanMovieTitle('imax The Batman')).toBe('The Batman');
      expect(cleanMovieTitle('The Batman dolby')).toBe('The Batman');
    });
  });

  describe('stripping time-based and language indicators', () => {
    it.each([
      ['MATINEE The Batman', 'The Batman'],
      ['The Batman DUBBED', 'The Batman'],
      ['The Batman (SUBTITLED)', 'The Batman'],
    ])('strips "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });
  });

  describe('title prefixes', () => {
    it.each([
      ['MOVIE: The Batman', 'The Batman'],
      ['FILM: The Batman', 'The Batman'],
      ['FEATURE: The Batman', 'The Batman'],
      ['SHOWING: The Batman', 'The Batman'],
    ])('removes prefix from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });

    it('is case-insensitive for prefixes', () => {
      expect(cleanMovieTitle('movie: The Batman')).toBe('The Batman');
    });
  });

  describe('title suffixes', () => {
    it.each([
      ['The Batman (MOVIE)', 'The Batman'],
      ['The Batman (FILM)', 'The Batman'],
      ['The Batman (FEATURE)', 'The Batman'],
    ])('removes suffix from "%s" -> "%s"', (input, expected) => {
      expect(cleanMovieTitle(input)).toBe(expected);
    });
  });

  describe('whitespace and punctuation normalization', () => {
    it('normalizes multiple spaces', () => {
      expect(cleanMovieTitle('The   Batman')).toBe('The Batman');
    });

    it('trims leading and trailing whitespace', () => {
      expect(cleanMovieTitle('  The Batman  ')).toBe('The Batman');
    });

    it('removes leading/trailing punctuation', () => {
      expect(cleanMovieTitle('- The Batman -')).toBe('The Batman');
      expect(cleanMovieTitle(': The Batman :')).toBe('The Batman');
      expect(cleanMovieTitle(', The Batman ,')).toBe('The Batman');
    });
  });

  describe('remaining parenthetical format info', () => {
    it('strips parenthetical with format keywords', () => {
      expect(cleanMovieTitle('The Batman (IMAX 3D Experience)')).toBe('The Batman');
      expect(cleanMovieTitle('The Batman (Dolby Atmos Surround)')).toBe('The Batman');
    });
  });

  describe('real-world titles', () => {
    it('handles complex ticket titles', () => {
      expect(cleanMovieTitle('IMAX: Dune Part Two (3D)')).toBe('Dune Part Two');
    });

    it('preserves titles without format indicators', () => {
      expect(cleanMovieTitle('The Shawshank Redemption')).toBe('The Shawshank Redemption');
    });

    it('preserves titles with numbers', () => {
      expect(cleanMovieTitle('Deadpool 2')).toBe('Deadpool 2');
    });
  });
});

// ============================================================================
// parseSeatInfo
// ============================================================================

describe('parseSeatInfo', () => {
  describe('null inputs', () => {
    it('returns null for both when both null', () => {
      expect(parseSeatInfo(null, null)).toEqual({ row: null, seat: null });
    });

    it('returns null for both when both empty', () => {
      expect(parseSeatInfo('', '')).toEqual({ row: null, seat: null });
    });
  });

  describe('combined row+seat in row field', () => {
    it('parses "H10" into row H, seat 10', () => {
      expect(parseSeatInfo('H10', null)).toEqual({ row: 'H', seat: '10' });
    });

    it('parses "A1" into row A, seat 1', () => {
      expect(parseSeatInfo('A1', null)).toEqual({ row: 'A', seat: '1' });
    });

    it('handles lowercase combined', () => {
      expect(parseSeatInfo('h10', null)).toEqual({ row: 'H', seat: '10' });
    });

    it('handles hyphen-separated combined', () => {
      expect(parseSeatInfo('A-12', null)).toEqual({ row: 'A', seat: '12' });
    });
  });

  describe('combined row+seat in seat field', () => {
    it('parses "H10" from seat field', () => {
      expect(parseSeatInfo(null, 'H10')).toEqual({ row: 'H', seat: '10' });
    });

    it('handles lowercase in seat field', () => {
      expect(parseSeatInfo(null, 'c5')).toEqual({ row: 'C', seat: '5' });
    });
  });

  describe('separated row and seat', () => {
    it('handles normal row and seat', () => {
      expect(parseSeatInfo('H', '10')).toEqual({ row: 'H', seat: '10' });
    });

    it('normalizes row to uppercase', () => {
      expect(parseSeatInfo('h', '10')).toEqual({ row: 'H', seat: '10' });
    });

    it('strips non-digit characters from seat', () => {
      expect(parseSeatInfo('H', '#10')).toEqual({ row: 'H', seat: '10' });
    });
  });

  describe('swapped row/seat (number as row, letter as seat)', () => {
    it('detects and swaps "10" row / "H" seat', () => {
      expect(parseSeatInfo('10', 'H')).toEqual({ row: 'H', seat: '10' });
    });

    it('normalizes swapped to uppercase row', () => {
      expect(parseSeatInfo('5', 'c')).toEqual({ row: 'C', seat: '5' });
    });
  });

  describe('"Row H Seat 10" format', () => {
    it('parses "Row H Seat 10"', () => {
      expect(parseSeatInfo('Row H Seat 10', null)).toEqual({ row: 'H', seat: '10' });
    });

    it('parses "Row H" without seat', () => {
      expect(parseSeatInfo('Row H', '10')).toEqual({ row: 'H', seat: '10' });
    });

    it('is case-insensitive', () => {
      expect(parseSeatInfo('row h seat 5', null)).toEqual({ row: 'H', seat: '5' });
    });
  });
});

// ============================================================================
// validateDate
// ============================================================================

describe('validateDate', () => {
  describe('null/empty input', () => {
    it('returns null for null', () => {
      expect(validateDate(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(validateDate('')).toBeNull();
    });
  });

  describe('YYYY-MM-DD format', () => {
    it('parses standard ISO date', () => {
      expect(validateDate('2024-03-15')).toBe('2024-03-15');
    });

    it('pads single-digit month and day', () => {
      expect(validateDate('2024-3-5')).toBe('2024-03-05');
    });
  });

  describe('MM/DD/YYYY format', () => {
    it('parses US format', () => {
      expect(validateDate('03/15/2024')).toBe('2024-03-15');
    });

    it('handles single-digit month/day', () => {
      expect(validateDate('3/5/2024')).toBe('2024-03-05');
    });
  });

  describe('DD.MM.YYYY (European) format', () => {
    it('parses European format', () => {
      expect(validateDate('15.03.2024')).toBe('2024-03-15');
    });

    it('handles single-digit day/month', () => {
      expect(validateDate('5.3.2024')).toBe('2024-03-05');
    });
  });

  describe('MM/DD (no year, uses fallback)', () => {
    it('uses fallback year when provided', () => {
      expect(validateDate('03/15', 2024)).toBe('2024-03-15');
    });

    it('uses current year when no fallback', () => {
      const currentYear = new Date().getFullYear();
      const result = validateDate('03/15');
      expect(result).toBe(`${currentYear}-03-15`);
    });
  });

  describe('Month name formats', () => {
    it('parses "Jan 15, 2024"', () => {
      expect(validateDate('Jan 15, 2024')).toBe('2024-01-15');
    });

    it('parses "January 15, 2024"', () => {
      expect(validateDate('January 15, 2024')).toBe('2024-01-15');
    });

    it('parses month name without year using fallback', () => {
      expect(validateDate('Mar 15', 2024)).toBe('2024-03-15');
    });

    it('parses "September 1, 2024"', () => {
      expect(validateDate('September 1, 2024')).toBe('2024-09-01');
    });

    it('parses "Dec 25 2024" (no comma)', () => {
      expect(validateDate('Dec 25 2024')).toBe('2024-12-25');
    });

    it('handles sept abbreviation', () => {
      expect(validateDate('Sept 15, 2024')).toBe('2024-09-15');
    });
  });

  describe('"null-MM-DD" prefix replacement', () => {
    it('replaces null prefix with fallback year', () => {
      expect(validateDate('null-03-15', 2024)).toBe('2024-03-15');
    });

    it('replaces null prefix with current year when no fallback', () => {
      const currentYear = new Date().getFullYear();
      const result = validateDate('null-06-20');
      expect(result).toBe(`${currentYear}-06-20`);
    });
  });

  describe('invalid dates', () => {
    it('returns null for invalid month (13)', () => {
      expect(validateDate('2024-13-15')).toBeNull();
    });

    it('returns null for invalid month (0)', () => {
      expect(validateDate('2024-00-15')).toBeNull();
    });

    it('returns null for invalid day (0)', () => {
      expect(validateDate('2024-03-00')).toBeNull();
    });

    it('returns null for invalid day (32)', () => {
      expect(validateDate('2024-03-32')).toBeNull();
    });

    it('returns null for Feb 30', () => {
      expect(validateDate('2024-02-30')).toBeNull();
    });

    it('returns null for Feb 29 in non-leap year', () => {
      expect(validateDate('2023-02-29')).toBeNull();
    });

    it('allows Feb 29 in leap year', () => {
      expect(validateDate('2024-02-29')).toBe('2024-02-29');
    });

    it('returns null for completely unparseable string', () => {
      expect(validateDate('not-a-date')).toBeNull();
    });

    it('returns null for invalid month name', () => {
      expect(validateDate('Foo 15, 2024')).toBeNull();
    });
  });
});

// ============================================================================
// normalizePrice
// ============================================================================

describe('normalizePrice', () => {
  describe('default currency', () => {
    it('defaults to USD when currency is null', () => {
      expect(normalizePrice(10, null)).toEqual({ amount: 10, currency: 'USD' });
    });

    it('defaults to USD when currency is empty', () => {
      expect(normalizePrice(10, '')).toEqual({ amount: 10, currency: 'USD' });
    });
  });

  describe('currency symbol mapping', () => {
    it.each([
      ['$', 'USD'],
      ['€', 'EUR'],
      ['£', 'GBP'],
      ['¥', 'JPY'],
      ['US$', 'USD'],
    ])('maps "%s" to "%s"', (symbol, code) => {
      expect(normalizePrice(10, symbol)).toEqual({ amount: 10, currency: code });
    });
  });

  describe('currency name mapping', () => {
    it.each([
      ['DOLLAR', 'USD'],
      ['DOLLARS', 'USD'],
      ['EURO', 'EUR'],
      ['EUROS', 'EUR'],
      ['POUND', 'GBP'],
      ['POUNDS', 'GBP'],
    ])('maps "%s" to "%s"', (name, code) => {
      expect(normalizePrice(10, name)).toEqual({ amount: 10, currency: code });
    });

    it('is case-insensitive', () => {
      expect(normalizePrice(10, 'dollar')).toEqual({ amount: 10, currency: 'USD' });
      expect(normalizePrice(10, 'Euro')).toEqual({ amount: 10, currency: 'EUR' });
    });
  });

  describe('recognized currency codes pass through', () => {
    it('keeps USD as-is', () => {
      expect(normalizePrice(10, 'USD')).toEqual({ amount: 10, currency: 'USD' });
    });

    it('uppercases currency code', () => {
      expect(normalizePrice(10, 'usd')).toEqual({ amount: 10, currency: 'USD' });
    });

    it('keeps unknown codes uppercased', () => {
      expect(normalizePrice(10, 'CAD')).toEqual({ amount: 10, currency: 'CAD' });
    });
  });

  describe('$0 treated as null', () => {
    it('converts amount 0 to null', () => {
      expect(normalizePrice(0, 'USD')).toEqual({ amount: null, currency: 'USD' });
    });
  });

  describe('null amount preserved', () => {
    it('keeps null amount', () => {
      expect(normalizePrice(null, 'USD')).toEqual({ amount: null, currency: 'USD' });
    });
  });

  describe('normal amounts', () => {
    it('preserves decimal amounts', () => {
      expect(normalizePrice(16.99, 'USD')).toEqual({ amount: 16.99, currency: 'USD' });
    });

    it('preserves negative amounts', () => {
      expect(normalizePrice(-5, 'USD')).toEqual({ amount: -5, currency: 'USD' });
    });
  });
});

// ============================================================================
// deduplicateTickets
// ============================================================================

describe('deduplicateTickets', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateTickets([])).toEqual([]);
  });

  it('returns single ticket unchanged', () => {
    const ticket = makeExtractedTicket();
    expect(deduplicateTickets([ticket])).toEqual([ticket]);
  });

  it('keeps tickets without confirmation number', () => {
    const ticket1 = makeExtractedTicket({ confirmation_number: null, movie_title: 'Movie 1' });
    const ticket2 = makeExtractedTicket({ confirmation_number: null, movie_title: 'Movie 2' });
    const result = deduplicateTickets([ticket1, ticket2]);
    expect(result).toHaveLength(2);
  });

  it('merges tickets with same confirmation number', () => {
    const ticket1 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      movie_title: 'The Batman',
      theater_name: null,
    });
    const ticket2 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      movie_title: null,
      theater_name: 'AMC Metreon',
    });
    const result = deduplicateTickets([ticket1, ticket2]);
    expect(result).toHaveLength(1);
    expect(result[0].movie_title).toBe('The Batman');
    expect(result[0].theater_name).toBe('AMC Metreon');
  });

  it('prefers existing (first) non-null values when merging', () => {
    const ticket1 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      movie_title: 'First Title',
    });
    const ticket2 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      movie_title: 'Second Title',
    });
    const result = deduplicateTickets([ticket1, ticket2]);
    expect(result).toHaveLength(1);
    expect(result[0].movie_title).toBe('First Title');
  });

  it('uses ?? for price_amount (preserves 0 from existing)', () => {
    const ticket1 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      price_amount: 0,
    });
    const ticket2 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      price_amount: 15,
    });
    const result = deduplicateTickets([ticket1, ticket2]);
    // The code uses ?? so 0 is kept from existing
    expect(result[0].price_amount).toBe(0);
  });

  it('fills null price_amount from duplicate', () => {
    const ticket1 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      price_amount: null,
    });
    const ticket2 = makeExtractedTicket({
      confirmation_number: 'DUP123',
      price_amount: 15,
    });
    const result = deduplicateTickets([ticket1, ticket2]);
    expect(result[0].price_amount).toBe(15);
  });

  it('handles mix of confirmed and unconfirmed tickets', () => {
    const confirmed1 = makeExtractedTicket({ confirmation_number: 'ABC', movie_title: 'Movie A' });
    const confirmed2 = makeExtractedTicket({ confirmation_number: 'ABC', movie_title: 'Movie A v2' });
    const unconfirmed = makeExtractedTicket({ confirmation_number: null, movie_title: 'Movie B' });
    const result = deduplicateTickets([confirmed1, confirmed2, unconfirmed]);
    // 1 merged confirmed + 1 unconfirmed
    expect(result).toHaveLength(2);
  });

  it('deduplicates multiple different confirmation numbers', () => {
    const tickets = [
      makeExtractedTicket({ confirmation_number: 'A1', movie_title: 'Movie A' }),
      makeExtractedTicket({ confirmation_number: 'B1', movie_title: 'Movie B' }),
      makeExtractedTicket({ confirmation_number: 'A1', movie_title: 'Movie A dup' }),
      makeExtractedTicket({ confirmation_number: 'B1', movie_title: 'Movie B dup' }),
    ];
    const result = deduplicateTickets(tickets);
    expect(result).toHaveLength(2);
  });

  it('trims confirmation number whitespace for matching', () => {
    const ticket1 = makeExtractedTicket({ confirmation_number: ' ABC123 ' });
    const ticket2 = makeExtractedTicket({ confirmation_number: 'ABC123' });
    const result = deduplicateTickets([ticket1, ticket2]);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// hasConfidentMatch
// ============================================================================

describe('hasConfidentMatch', () => {
  it('returns false when tmdbMatch is null', () => {
    const ticket = makeProcessedTicket({ tmdbMatch: null });
    expect(hasConfidentMatch(ticket)).toBe(false);
  });

  it('returns true when confidence >= default threshold (0.7)', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.7 }),
    });
    expect(hasConfidentMatch(ticket)).toBe(true);
  });

  it('returns false when confidence < default threshold (0.7)', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.69 }),
    });
    expect(hasConfidentMatch(ticket)).toBe(false);
  });

  it('returns true when confidence >= custom threshold', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.5 }),
    });
    expect(hasConfidentMatch(ticket, 0.5)).toBe(true);
  });

  it('returns false when confidence < custom threshold', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.8 }),
    });
    expect(hasConfidentMatch(ticket, 0.9)).toBe(false);
  });

  it('returns true for perfect match', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 1.0 }),
    });
    expect(hasConfidentMatch(ticket)).toBe(true);
  });
});

// ============================================================================
// getTicketsNeedingReview
// ============================================================================

describe('getTicketsNeedingReview', () => {
  it('returns empty array when all tickets have confident matches and no errors', () => {
    const tickets = [
      makeProcessedTicket({
        tmdbMatch: makeTMDBMatch({ confidence: 0.95 }),
        processingErrors: [],
      }),
    ];
    expect(getTicketsNeedingReview(tickets)).toEqual([]);
  });

  it('includes tickets with no TMDB match', () => {
    const ticket = makeProcessedTicket({ tmdbMatch: null });
    expect(getTicketsNeedingReview([ticket])).toEqual([ticket]);
  });

  it('includes tickets with low confidence match', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.5 }),
    });
    expect(getTicketsNeedingReview([ticket])).toEqual([ticket]);
  });

  it('includes tickets with processing errors even if match is confident', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.95 }),
      processingErrors: ['Invalid date format: foo'],
    });
    expect(getTicketsNeedingReview([ticket])).toEqual([ticket]);
  });

  it('returns empty array for empty input', () => {
    expect(getTicketsNeedingReview([])).toEqual([]);
  });

  it('filters correctly with mix of good and bad tickets', () => {
    const goodTicket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.9 }),
      processingErrors: [],
    });
    const badTicket1 = makeProcessedTicket({ tmdbMatch: null });
    const badTicket2 = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.3 }),
    });
    const result = getTicketsNeedingReview([goodTicket, badTicket1, badTicket2]);
    expect(result).toHaveLength(2);
    expect(result).toContain(badTicket1);
    expect(result).toContain(badTicket2);
  });
});

// ============================================================================
// getTMDBMovieFromTicket
// ============================================================================

describe('getTMDBMovieFromTicket', () => {
  it('returns null when tmdbMatch is null', () => {
    const ticket = makeProcessedTicket({ tmdbMatch: null });
    expect(getTMDBMovieFromTicket(ticket)).toBeNull();
  });

  it('returns the movie when tmdbMatch exists', () => {
    const movie = makeTMDBMovie({ id: 123, title: 'Test Movie' });
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ movie: movie as any }),
    });
    const result = getTMDBMovieFromTicket(ticket);
    expect(result).toBe(movie);
    expect(result?.id).toBe(123);
    expect(result?.title).toBe('Test Movie');
  });
});

// ============================================================================
// findTMDBMatch (async, uses mocked searchMovies)
// ============================================================================

describe('findTMDBMatch', () => {
  beforeEach(() => {
    mockSearchMovies.mockReset();
  });

  it('returns null for empty/null title', async () => {
    expect(await findTMDBMatch('')).toBeNull();
    expect(await findTMDBMatch('   ')).toBeNull();
    expect(mockSearchMovies).not.toHaveBeenCalled();
  });

  it('returns match with confidence for exact title match', async () => {
    const movie = makeTMDBMovie({ title: 'The Batman' });
    mockSearchMovies.mockResolvedValueOnce({
      movies: [movie as any],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });

    const result = await findTMDBMatch('The Batman');
    expect(result).not.toBeNull();
    expect(result!.movie.title).toBe('The Batman');
    expect(result!.confidence).toBe(1); // exact match
    expect(result!.originalTitle).toBe('The Batman');
  });

  it('cleans title before searching', async () => {
    const movie = makeTMDBMovie({ title: 'Dune Part Two' });
    mockSearchMovies.mockResolvedValueOnce({
      movies: [movie as any],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });

    await findTMDBMatch('IMAX Dune Part Two (3D)');
    expect(mockSearchMovies).toHaveBeenCalledWith('Dune Part Two', 1, 'title');
  });

  it('falls back to raw title search when cleaned search returns nothing', async () => {
    const movie = makeTMDBMovie({ title: 'Some Movie' });
    // First search (cleaned) returns empty
    mockSearchMovies.mockResolvedValueOnce({
      movies: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    });
    // Second search (raw fallback)
    mockSearchMovies.mockResolvedValueOnce({
      movies: [movie as any],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });

    const result = await findTMDBMatch('Some Movie');
    expect(mockSearchMovies).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
  });

  it('returns null when both cleaned and fallback searches return nothing', async () => {
    mockSearchMovies.mockResolvedValue({
      movies: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    });

    const result = await findTMDBMatch('Nonexistent Movie XYZ');
    expect(result).toBeNull();
  });

  it('returns null on searchMovies error', async () => {
    mockSearchMovies.mockRejectedValueOnce(new Error('Network error'));

    const result = await findTMDBMatch('The Batman');
    expect(result).toBeNull();
  });

  it('picks best match among multiple results', async () => {
    const exactMatch = makeTMDBMovie({ id: 1, title: 'Inception' });
    const partialMatch = makeTMDBMovie({ id: 2, title: 'Inception: The Experience' });
    mockSearchMovies.mockResolvedValueOnce({
      movies: [partialMatch as any, exactMatch as any],
      page: 1,
      totalPages: 1,
      totalResults: 2,
    });

    const result = await findTMDBMatch('Inception');
    expect(result).not.toBeNull();
    expect(result!.movie.id).toBe(1); // exact match wins
    expect(result!.confidence).toBe(1);
  });
});
