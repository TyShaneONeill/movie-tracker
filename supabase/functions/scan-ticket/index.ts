import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { sleep } from '../_shared/delay.ts';
import { checkDailyAiSpend, logAiCost, buildSpendLimitResponse, AI_COST_ESTIMATES } from '../_shared/cost-tracking.ts';

// ============================================================================
// Types
// ============================================================================

interface ScanTicketRequest {
  image: string; // base64 encoded image data
  mimeType: 'image/heic' | 'image/jpeg' | 'image/png' | 'image/webp';
}

interface ExtractedTicket {
  movie_title: string;
  theater_name: string | null;
  theater_chain: string | null;
  date: string | null; // YYYY-MM-DD
  showtime: string | null; // HH:MM (24hr)
  seat: { row: string | null; number: string | null } | null;
  auditorium: string | null;
  format: string | null; // IMAX/Dolby/3D/Standard
  price: { amount: number | null; currency: string } | null;
  ticket_type: string | null; // Adult/Child/Senior
  confirmation_number: string | null;
  barcode_visible: boolean;
}

interface GeminiExtraction {
  tickets: ExtractedTicket[];
  image_quality: 'good' | 'fair' | 'poor';
  confidence_score: number;
  notes: string;
}

interface CleanedTicket {
  movieTitle: string;
  theaterName: string | null;
  theaterChain: string | null;
  date: string | null;
  showtime: string | null;
  seat: { row: string | null; number: number | null } | null;
  auditorium: string | null;
  format: string | null;
  price: { amount: number; currency: string } | null;
  ticketType: string | null;
  confirmationNumber: string | null;
  barcodeVisible: boolean;
}

interface TMDBMatch {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  confidence: number;
}

interface ProcessedTicket {
  extracted: ExtractedTicket;
  cleaned: CleanedTicket;
  tmdbMatch: TMDBMatch | null;
  needsReview: boolean;
}

interface ScanTicketResponse {
  success: boolean;
  scansRemaining: number;
  dailyLimit: number;
  accountTier: string;
  tickets: ProcessedTicket[];
  extractionConfidence: number;
  notes: string;
}

interface RateLimitResult {
  allowed: boolean;
  scans_remaining: number;
  daily_limit: number;
  account_tier: string;
  reset_at: string;
}

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
}

interface TMDBSearchResponse {
  results: TMDBMovie[];
  total_results: number;
}

// ============================================================================
// System Instruction (role + known formats + edge cases)
// ============================================================================

const SYSTEM_INSTRUCTION = `You are a specialized cinema ticket data extraction assistant. You extract structured information from photos of movie tickets and receipts.

RULES:
- Extract ONLY what is visible on the ticket. Never hallucinate or guess values.
- If a field is not visible or illegible, use null.
- Distinguish carefully between "time of sale" (purchase timestamp) and "showtime" (movie screening time). Only extract the SHOWTIME.
- Extract the PER-TICKET price, not the total for multiple tickets. If the ticket shows a total for N tickets, divide by N.
- Strip format indicators (IMAX, DOLBY, 3D, etc.) from movie_title and put them in the format field instead.
- For confidence_score, base it on image clarity and text legibility: 0.95 = crisp/clear, 0.75 = slightly faded but readable, 0.5 = partially illegible, 0.25 = mostly unreadable.

KNOWN TICKET FORMATS:

West Wind Drive-In (thermal receipt):
- "Screen: N - FM XXX.X" — the screen number is N, the FM frequency is the drive-in audio channel. Ignore the FM portion.
- Price shown may be TOTAL for multiple tickets. Look for a quantity indicator and divide to get per-ticket price.
- Service fees are also totals — divide by ticket quantity.
- Transaction timestamp (e.g. "18;38 20OCT25" with semicolons) is the sale time, NOT the showtime. The showtime appears separately near the movie title.
- Barcode wrapped in asterisks: *XXXXXXXXX*. The number inside matches the transaction number (T/N).
- No assigned seats (drive-in theater).

CW Theatres (multiple variants):
- Older cardboard design: Black/white/gold color scheme with "M" crown watermark. Thicker stock. No barcode or QR code.
- Newer thin paper design: Current 2025-26 era receipt paper.
- Ticket type abbreviations: "SRMat" = Senior Matinee, "AdltMat" = Adult Matinee, "AdltEve" = Adult Evening. Extract the raw abbreviation.
- Date may have a partially illegible year (e.g. "03/04/202?"). If the last digit is unreadable, use null for the year portion.
- Row and seat are separate fields, not combined.
- MPAA rating (PG, PG13, R, etc.) may appear on the ticket.

AMC Theatres (thermal receipt + digital):
- Format often appended to movie title (e.g. "Dune: Part Two - DOLBY"). Strip the format suffix.
- AMC Stubs loyalty numbers should NOT be confused with confirmation/transaction numbers.
- Kiosk receipts vs box office receipts may have different layouts.

Regal Cinemas (thermal receipt + digital):
- Regal Crown Club numbers are NOT confirmation codes.
- RPX screenings should have format = "RPX".

Cinemark Theatres (thermal receipt + digital):
- XD screenings should have format = "XD".
- Movie Rewards numbers are NOT confirmation codes.

Alamo Drafthouse (receipt):
- Receipts may include food/drink orders. Only extract the MOVIE TICKET price, not food items.
- Pre-show event titles are NOT the movie title.

GENERAL EDGE CASES:
- Thermal receipts fade over time. Adjust confidence_score based on legibility.
- If multiple tickets for the SAME movie appear, extract only one (they are duplicates from a multi-ticket purchase).
- Some tickets show date as "MM/DD/YYYY", others as "DD MMM YY". Always convert to YYYY-MM-DD.
- Showtime may be in 12hr (7:30 PM) or 24hr (19:30) format. Always convert to HH:MM in 24hr format.`;

// ============================================================================
// Extraction Prompt (few-shot examples + task)
// ============================================================================

const EXTRACTION_PROMPT = `Extract movie ticket information from this image.

Here are examples of correct extractions from different ticket types:

EXAMPLE 1 — Drive-in thermal receipt:
Ticket shows: "Screen: 6 - FM 101.3", Movie: "Good Fortune", Date: 10/20/2025, Time: 7:20 PM, 2 tickets at $18.00 total + $2.50 service fee, Ticket Type: GENERAL, T/N: 001768544
Correct extraction:
{"movie_title": "Good Fortune", "theater_name": "West Wind Capitol 6 Drive-In", "theater_chain": "West Wind Drive-In", "date": "2025-10-20", "showtime": "19:20", "seat": null, "auditorium": "6", "format": "Standard", "price": {"amount": 9.00, "currency": "USD"}, "ticket_type": "General", "confirmation_number": "001768544", "barcode_visible": true}
Note: Screen 6 extracted (FM frequency ignored), price divided by 2 tickets, sale time ignored.

EXAMPLE 2 — Cardboard cinema ticket:
Ticket shows: CW Theatres, Screen: 8, Movie: "Creed III", Rating: PG13, Date: 03/04/202?, Day: Saturday, Time: 1:40 PM, Ticket Type: SRMat, Price: $9.00, Row: O, Seat: 11
Correct extraction:
{"movie_title": "Creed III", "theater_name": "CW Theatres Lincoln Mall 16", "theater_chain": "CW Theatres", "date": "2023-03-04", "showtime": "13:40", "seat": {"row": "O", "number": "11"}, "auditorium": "8", "format": "Standard", "price": {"amount": 9.00, "currency": "USD"}, "ticket_type": "SRMat", "confirmation_number": "0006-99030423133828", "barcode_visible": false}
Note: Year inferred from Creed III release (March 2023). SRMat extracted as-is.

EXAMPLE 3 — AMC thermal receipt with format in title:
Ticket shows: "Oppenheimer - IMAX", AMC Metreon 16, Date: 07/21/2023, 7:00 PM, Aud 7, Row H, Seat 10, Price: $24.99
Correct extraction:
{"movie_title": "Oppenheimer", "theater_name": "AMC Metreon 16", "theater_chain": "AMC", "date": "2023-07-21", "showtime": "19:00", "seat": {"row": "H", "number": "10"}, "auditorium": "7", "format": "IMAX", "price": {"amount": 24.99, "currency": "USD"}, "ticket_type": "Adult", "confirmation_number": null, "barcode_visible": true}
Note: "IMAX" stripped from title and placed in format field.

EXAMPLE 4 — Faded thermal receipt:
Ticket shows: Partially faded text, movie appears to be "The B[...]man", date partially visible "0?/??/2022", price $12.50
Correct extraction:
{"movie_title": "The Batman", "theater_name": null, "theater_chain": null, "date": null, "showtime": null, "seat": null, "auditorium": null, "format": null, "price": {"amount": 12.50, "currency": "USD"}, "ticket_type": null, "confirmation_number": null, "barcode_visible": false}
Note: Low confidence (0.4) due to faded text. Date set to null since it was unreadable. Movie title inferred from partial text.

EXAMPLE 5 — Digital/mobile ticket screenshot:
Ticket shows: Regal Crown Club, "Dune: Part Two 3D", Regal Union Square, 03/01/2024, 6:45 PM, Screen 12, Seat J14, $19.99
Correct extraction:
{"movie_title": "Dune: Part Two", "theater_name": "Regal Union Square", "theater_chain": "Regal", "date": "2024-03-01", "showtime": "18:45", "seat": {"row": "J", "number": "14"}, "auditorium": "12", "format": "3D", "price": {"amount": 19.99, "currency": "USD"}, "ticket_type": "Adult", "confirmation_number": null, "barcode_visible": true}
Note: "3D" stripped from title and placed in format. Crown Club number ignored.

Now extract from the provided ticket image. Return one entry per unique ticket visible.`;

// ============================================================================
// Response Schema (Gemini structured output)
// ============================================================================

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    tickets: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          movie_title: { type: "STRING", description: "Movie title without format indicators" },
          theater_name: { type: "STRING", nullable: true, description: "Full theater name" },
          theater_chain: { type: "STRING", nullable: true, description: "Chain name (AMC, Regal, Cinemark, etc.)" },
          date: { type: "STRING", nullable: true, description: "YYYY-MM-DD format" },
          showtime: { type: "STRING", nullable: true, description: "HH:MM in 24hr format" },
          seat: {
            type: "OBJECT",
            nullable: true,
            properties: {
              row: { type: "STRING", nullable: true },
              number: { type: "STRING", nullable: true },
            },
          },
          auditorium: { type: "STRING", nullable: true, description: "Screen/auditorium number" },
          format: { type: "STRING", nullable: true, description: "IMAX, Dolby, 3D, Standard, RPX, XD, 4DX, or null" },
          price: {
            type: "OBJECT",
            nullable: true,
            properties: {
              amount: { type: "NUMBER", nullable: true, description: "Per-ticket price" },
              currency: { type: "STRING", description: "ISO currency code" },
            },
          },
          ticket_type: { type: "STRING", nullable: true, description: "Adult, Child, Senior, or raw abbreviation" },
          confirmation_number: { type: "STRING", nullable: true },
          barcode_visible: { type: "BOOLEAN" },
        },
        required: ["movie_title", "barcode_visible"],
      },
    },
    image_quality: {
      type: "STRING",
      enum: ["good", "fair", "poor"],
    },
    confidence_score: {
      type: "NUMBER",
      description: "0.0-1.0 based on text clarity and extraction certainty",
    },
    notes: {
      type: "STRING",
      description: "Observations about the ticket, edge cases encountered, or fields that were uncertain",
    },
  },
  required: ["tickets", "image_quality", "confidence_score", "notes"],
};

// ============================================================================
// Post-Processing Functions
// ============================================================================

/**
 * Remove format indicators from movie titles (DOLBY, IMAX, 3D, 2D, etc.)
 */
function cleanMovieTitle(title: string): string {
  if (!title) return '';

  // Patterns to remove from movie titles
  const formatPatterns = [
    /\s*[-–—:]\s*(DOLBY|IMAX|3D|2D|4DX|SCREENX|RPX|XD|DBOX|D-BOX|ATMOS|CINEMA)\s*$/i,
    /\s*\((DOLBY|IMAX|3D|2D|4DX|SCREENX|RPX|XD|DBOX|D-BOX|ATMOS|CINEMA)\)\s*$/i,
    /\s*\[(DOLBY|IMAX|3D|2D|4DX|SCREENX|RPX|XD|DBOX|D-BOX|ATMOS|CINEMA)\]\s*$/i,
    /\s*(DOLBY CINEMA|DOLBY ATMOS|IMAX 3D|REAL ?3D|DIGITAL 3D)\s*$/i,
    /\s*[-–—]\s*(DOLBY CINEMA|DOLBY ATMOS|IMAX 3D|REAL ?3D|DIGITAL 3D)\s*$/i,
    /\s*:\s*(DOLBY|IMAX|3D)\s*$/i,
    /\s+IN (DOLBY|IMAX|3D|REALD)\s*$/i,
    /\s+\(?(OV|OmU|OmdU)\)?\s*$/i, // Original version indicators
    /\s*-\s*$/, // Trailing dashes
  ];

  let cleaned = title.trim();

  for (const pattern of formatPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean up any double spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Parse seat info - handle combined seats like "H10" -> row H, seat 10
 */
function parseSeatInfo(seat: { row: string | null; number: string | null } | null): { row: string | null; number: number | null } | null {
  if (!seat) return null;

  let row = seat.row;
  let seatNumber: number | null = null;

  // If number is provided as string, parse it
  if (seat.number) {
    const parsed = parseInt(seat.number, 10);
    if (!isNaN(parsed)) {
      seatNumber = parsed;
    }
  }

  // Handle combined format like "H10" in the row field
  if (row && !seatNumber) {
    const combinedMatch = row.match(/^([A-Za-z]+)(\d+)$/);
    if (combinedMatch) {
      row = combinedMatch[1].toUpperCase();
      seatNumber = parseInt(combinedMatch[2], 10);
    }
  }

  // Handle row only (like "H" or "10")
  if (row) {
    row = row.toUpperCase().trim();
  }

  if (!row && !seatNumber) return null;

  return { row, number: seatNumber };
}

/**
 * Normalize price - default currency to USD, treat $0 as null
 */
function normalizePrice(price: { amount: number | null; currency: string } | null): { amount: number; currency: string } | null {
  if (!price) return null;
  if (price.amount === null || price.amount === undefined || price.amount === 0) return null;

  return {
    amount: Math.round(price.amount * 100) / 100, // Round to 2 decimal places
    currency: price.currency || 'USD',
  };
}

/**
 * Validate and normalize date format
 */
function normalizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse common formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return dateStr; // Return as-is if we can't parse
}

/**
 * Normalize showtime to 24hr format
 */
function normalizeShowtime(timeStr: string | null): string | null {
  if (!timeStr) return null;

  // Already in HH:MM format
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }

  // Handle 12hr format like "7:30 PM"
  const match12hr = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12hr) {
    let hours = parseInt(match12hr[1], 10);
    const minutes = match12hr[2];
    const period = match12hr[3].toUpperCase();

    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  return timeStr;
}

/**
 * Clean a single extracted ticket
 */
function cleanTicket(extracted: ExtractedTicket): CleanedTicket {
  return {
    movieTitle: cleanMovieTitle(extracted.movie_title),
    theaterName: extracted.theater_name?.trim() || null,
    theaterChain: extracted.theater_chain?.trim() || null,
    date: normalizeDate(extracted.date),
    showtime: normalizeShowtime(extracted.showtime),
    seat: parseSeatInfo(extracted.seat),
    auditorium: extracted.auditorium?.toString().trim() || null,
    format: extracted.format?.toUpperCase().trim() || null,
    price: normalizePrice(extracted.price),
    ticketType: extracted.ticket_type?.trim() || null,
    confirmationNumber: extracted.confirmation_number?.trim() || null,
    barcodeVisible: extracted.barcode_visible ?? false,
  };
}

/**
 * Deduplicate tickets by confirmation number
 */
function deduplicateTickets(tickets: ProcessedTicket[]): ProcessedTicket[] {
  const seen = new Map<string, ProcessedTicket>();
  const result: ProcessedTicket[] = [];

  for (const ticket of tickets) {
    const confirmNum = ticket.cleaned.confirmationNumber;

    if (confirmNum && seen.has(confirmNum)) {
      // Skip duplicate
      continue;
    }

    if (confirmNum) {
      seen.set(confirmNum, ticket);
    }

    result.push(ticket);
  }

  return result;
}

// ============================================================================
// TMDB Search
// ============================================================================

/**
 * Search TMDB for a movie by title
 */
async function searchTMDB(
  title: string,
  year: string | null,
  apiKey: string
): Promise<TMDBMatch | null> {
  try {
    const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
    searchUrl.searchParams.set('api_key', apiKey);
    searchUrl.searchParams.set('query', title);
    searchUrl.searchParams.set('include_adult', 'false');

    // If we have a year from the ticket date, use it to narrow results
    if (year) {
      searchUrl.searchParams.set('year', year);
    }

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      console.error('[scan-ticket] TMDB search failed:', response.status, response.statusText);
      return null;
    }

    const data: TMDBSearchResponse = await response.json();

    if (data.results.length === 0) {
      // Try without year constraint (with delay to respect rate limits)
      if (year) {
        await sleep(TMDB_CALL_DELAY_MS);
        return searchTMDB(title, null, apiKey);
      }
      return null;
    }

    const topResult = data.results[0];

    // Calculate confidence based on title similarity
    const confidence = calculateTitleConfidence(title, topResult.title);

    return {
      id: topResult.id,
      title: topResult.title,
      poster_path: topResult.poster_path,
      release_date: topResult.release_date,
      confidence,
    };
  } catch (error) {
    console.error('[scan-ticket] TMDB search error:', error);
    return null;
  }
}

/**
 * Calculate confidence score for title match
 */
function calculateTitleConfidence(searchTitle: string, resultTitle: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const search = normalize(searchTitle);
  const result = normalize(resultTitle);

  if (search === result) return 1.0;

  // Check if one contains the other
  if (result.includes(search) || search.includes(result)) {
    return 0.9;
  }

  // Calculate Levenshtein distance ratio
  const distance = levenshteinDistance(search, result);
  const maxLen = Math.max(search.length, result.length);
  const similarity = 1 - (distance / maxLen);

  return Math.round(similarity * 100) / 100;
}

/**
 * Levenshtein distance for string similarity
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

  return matrix[b.length][a.length];
}

// ============================================================================
// Cache Lookup
// ============================================================================

/**
 * Search the movies cache table by title before hitting TMDB.
 * Returns a TMDBMatch if a cached movie matches, or null.
 */
async function searchCache(
  title: string,
  supabaseClient: ReturnType<typeof createClient>
): Promise<TMDBMatch | null> {
  try {
    const { data, error } = await supabaseClient
      .from('movies')
      .select('tmdb_id, title, poster_path, release_date')
      .ilike('title', title)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.tmdb_id,
      title: data.title,
      poster_path: data.poster_path,
      release_date: data.release_date,
      confidence: calculateTitleConfidence(title, data.title),
    };
  } catch {
    return null;
  }
}

// Delay between TMDB API calls to stay under rate limits (40 req / 10 sec)
const TMDB_CALL_DELAY_MS = 300;

// ============================================================================
// Gemini API
// ============================================================================

/**
 * Call Gemini API to extract ticket data from image
 */
async function extractWithGemini(
  base64Image: string,
  mimeType: string,
  apiKey: string
): Promise<GeminiExtraction> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          response_mime_type: "application/json",
          response_schema: RESPONSE_SCHEMA,
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[scan-ticket] Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const geminiResponse = await response.json();

  // With structured output (response_schema), Gemini returns clean JSON directly
  const textContent = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  try {
    const parsed = JSON.parse(textContent);

    // Validate the structure
    if (!parsed.tickets || !Array.isArray(parsed.tickets)) {
      throw new Error('Invalid extraction format: missing tickets array');
    }

    return {
      tickets: parsed.tickets,
      image_quality: parsed.image_quality || 'fair',
      confidence_score: parsed.confidence_score ?? 0.5,
      notes: parsed.notes || '',
    };
  } catch (parseError) {
    console.error('[scan-ticket] Failed to parse Gemini extraction response:', parseError);
    console.error('[scan-ticket] Raw response text:', textContent);
    throw new Error('Failed to parse ticket extraction response');
  }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // Get API keys from environment
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Get the authorization header to extract user ID
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for RPC calls
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create user client to get user info
    const supabaseUserClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { image, mimeType }: ScanTicketRequest = await req.json();

    if (!image || typeof image !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Image data is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Reject images over 10MB (base64 length * 3/4 ≈ decoded byte size)
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const estimatedBytes = Math.ceil(image.length * 3 / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: 'Image too large. Maximum size is 10MB.' }),
        { status: 413, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const validMimeTypes = ['image/heic', 'image/jpeg', 'image/png', 'image/webp'];
    if (!mimeType || !validMimeTypes.includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: 'Valid mimeType is required (image/heic, image/jpeg, image/png, image/webp)' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const { data: rateLimit, error: rateLimitError } = await supabaseClient.rpc(
      'check_and_increment_scan',
      {
        p_user_id: user.id,
        p_daily_limit: 3
      }
    );

    if (rateLimitError) {
      console.error('[scan-ticket] Rate limit check failed:', rateLimitError);
      throw new Error('Failed to check rate limit');
    }

    const rateLimitResult = rateLimit as RateLimitResult;

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Daily scan limit reached',
          scansRemaining: 0,
          dailyLimit: rateLimitResult.daily_limit,
          accountTier: rateLimitResult.account_tier,
          resetAt: rateLimitResult.reset_at,
        }),
        { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Check daily AI spend limit before calling Gemini
    const spendCheck = await checkDailyAiSpend(supabaseClient);
    if (!spendCheck.allowed) {
      return buildSpendLimitResponse(req, spendCheck);
    }

    // Extract ticket data using Gemini
    let extraction: GeminiExtraction;
    try {
      extraction = await extractWithGemini(image, mimeType, GEMINI_API_KEY);
    } catch (geminiError) {
      console.error('[scan-ticket] Gemini extraction failed:', geminiError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to extract ticket information. Please try with a clearer image.',
          scansRemaining: rateLimitResult.scans_remaining,
        }),
        { status: 422, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Log Gemini API cost
    await logAiCost(
      supabaseClient,
      user.id,
      'scan_ticket',
      'gemini-2.0-flash',
      AI_COST_ESTIMATES['gemini-2.0-flash'],
    );

    // Process each extracted ticket with cache-first lookups and rate-limited TMDB calls
    const processedTickets: ProcessedTicket[] = [];
    let tmdbCallCount = 0;

    for (const extractedTicket of extraction.tickets) {
      const cleaned = cleanTicket(extractedTicket);

      // Get year from ticket date for TMDB search
      const year = cleaned.date ? cleaned.date.split('-')[0] : null;

      // Check cache first to avoid unnecessary TMDB calls
      let tmdbMatch = await searchCache(cleaned.movieTitle, supabaseClient);

      if (tmdbMatch) {
        console.log(`[scan-ticket] Cache hit for "${cleaned.movieTitle}"`);
      } else {
        // Delay between TMDB calls to respect rate limits
        if (tmdbCallCount > 0) {
          await sleep(TMDB_CALL_DELAY_MS);
        }
        tmdbMatch = await searchTMDB(cleaned.movieTitle, year, TMDB_API_KEY);
        tmdbCallCount++;
      }

      // Determine if manual review is needed
      const needsReview =
        !tmdbMatch ||
        tmdbMatch.confidence < 0.7 ||
        extraction.confidence_score < 0.7 ||
        extraction.image_quality === 'poor';

      processedTickets.push({
        extracted: extractedTicket,
        cleaned,
        tmdbMatch,
        needsReview,
      });
    }

    // Deduplicate tickets
    const deduplicatedTickets = deduplicateTickets(processedTickets);

    const response: ScanTicketResponse = {
      success: true,
      scansRemaining: rateLimitResult.scans_remaining,
      dailyLimit: rateLimitResult.daily_limit,
      accountTier: rateLimitResult.account_tier,
      tickets: deduplicatedTickets,
      extractionConfidence: extraction.confidence_score,
      notes: extraction.notes,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[scan-ticket] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
