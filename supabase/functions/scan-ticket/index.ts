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
  chain_identified: string;
  chain_confidence: number;
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
  chainIdentified: string;
  chainConfidence: number;
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
// Extraction Prompt
// ============================================================================

const EXTRACTION_PROMPT = `You are a movie ticket data extraction expert. Follow these steps carefully.

## Step 1: Identify the Theater Chain
Examine the ticket image for these visual identifiers:
- AMC: "amc amazing" watermark with small icons (popcorn, rockets, planets, skulls)
- Cinemark: Stylized italic "CINEMARK" logo. Location may say "Century" (subsidiary)
- Showcase: "SHOWCASE CINEMA DE LUX" or "SHOWCASE" diagonal watermark
- Regal: Regal crown/shield repeating watermark
- CW/Cinemaworld: Coca-Cola branded cardstock (blue/pink) or plain white two-part ticket with "Cinemaworld Lincoln"
- Alamo Drafthouse: "ALAMO DRAFTHOUSE" text
- Drive-In: "Rustic Tri-Vue" or "West Wind" text, or FM frequency in screen field
If no chain matches: "Unknown"

## Step 2: Apply Chain-Specific Extraction Rules

### AMC
- Strip "AD CC" suffix from ALL titles (Audio Description + Closed Captioning)
- Format may be embedded in title BEFORE "AD CC" (e.g., "LILO & DOLBY AD CC" → title: "Lilo & Stitch", format: "Dolby")
- Titles may be truncated mid-word (2022) or at word boundary (2024+) — infer the full title
- Seat is in a dark box as combined row+number ("G2" = Row G, Seat 2)
- Location has store ID suffix ("Assembly Row #0504") — don't include "#0504" in theater name
- "ADULT*" asterisk = AMC Stubs pricing
- Chain name is ONLY in the watermark, never printed as text

### Cinemark
- "House: NN" = auditorium number (Cinemark's unique term for screen)
- "Seat# XNN" = combined row letter + seat number (G12 = Row G, Seat 12)
- "General Admission" and "Matinee" are PRICING TIERS — seats ARE assigned
- "Century" in location = Cinemark subsidiary, chain is still "Cinemark"
- Titles are clean — no suffix to strip
- "Rated: PG-13" includes "Rated:" prefix — extract just the rating code

### Showcase Cinema de Lux
- 2017 stubs may print venue name ("Providence Place Cinema") not chain name — chain is still "Showcase Cinema de Lux"
- 2017 non-IMAX: "-CCDV" suffix on titles — strip it (e.g., "GUARD 2-CCDV" → "Guardians of the Galaxy Vol. 2")
- 2017 IMAX: format appended to title ("FAST 8 IMAX" → title: "The Fate of the Furious", format: "IMAX")
- "SEAT L25" = combined row+seat (L = Row, 25 = Seat)
- "GAR" = General Admission Reserved, "GA" = General Admission (no seats), "SPASS" = free pass
- "THEATRE" or "Theatre" = auditorium number

### Regal
- Chain name never printed as text — only in crown watermark
- "REGW" after price = Regal Web purchase channel (not part of price)
- Title may drop words to fit (e.g., "Jay Silent Bob" → "Jay and Silent Bob Reboot")
- 2-digit year in dates (MM/DD/YY)

### CW Theatres / Cinemaworld
- Seat format varies: "Row-N, Seat-6" (dashes), "Row=N, Seat=Y" (equals), or "ROW,SEAT" (comma-separated)
- Ticket types: "AdEve"=Adult Evening, "STEve"=Student Evening, "ADMat"=Adult Matinee, "SRMat"=Senior Matinee, "MIMat"=Military Matinee
- No year on dates for Coca-Cola cardstock variants — infer from movie release dates
- May have "2D" prefix on older titles — strip it

### Drive-In Theaters
- Two movies on one ticket separated by "/" — extract BOTH (first = primary feature)
- "Theatre #N" = outdoor screen number, not indoor auditorium
- No seat info (parking spots, not seats)
- Late showtime (8-9 PM) in summer is normal for drive-ins
- Price may be per-car, not per-person

### Unknown Chain
- Extract all visible fields using standard layout assumptions
- Set chain_identified to "Unknown" with low confidence

## Step 3: Extract Ticket Data
For EACH ticket visible, extract the fields into the required JSON schema.
Important:
- Use the FULL movie title (reconstruct truncated titles when possible)
- Date must be YYYY-MM-DD format
- Showtime must be HH:MM in 24-hour format
- If year is missing, infer from movie release dates`;

// ============================================================================
// Post-Processing Functions
// ============================================================================

/**
 * Remove format indicators from movie titles (DOLBY, IMAX, 3D, 2D, etc.)
 */
function cleanMovieTitle(title: string): string {
  if (!title) return '';

  // Patterns to remove from movie titles
  // Chain-specific patterns first, then generic format patterns
  const formatPatterns = [
    /\s+AD\s+CC\s*$/i,                    // AMC: "STRANGE WORL AD CC" → "STRANGE WORL"
    /\s+\w+\s+AD\s+CC\s*$/i,             // AMC format+AD CC: "LILO & DOLBY AD CC" → "LILO &" (format strip below catches DOLBY separately)
    /\s*-\s*CCDV\s*$/i,                   // Showcase 2017: "GUARD 2-CCDV" → "GUARD 2"
    /\s*-\s*CC\s*$/i,                     // Showcase generic CC suffix
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
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              chain_identified: {
                type: "string",
                description: "Theater chain identified from visual cues",
                enum: ["AMC", "Cinemark", "Showcase Cinema de Lux", "Regal", "CW Theatres", "Alamo Drafthouse", "Drive-In", "Unknown"]
              },
              chain_confidence: {
                type: "number",
                description: "Confidence in chain identification (0.0-1.0)"
              },
              tickets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    movie_title: { type: "string" },
                    theater_name: { type: "string" },
                    theater_chain: { type: "string" },
                    date: { type: "string" },
                    showtime: { type: "string" },
                    seat: {
                      type: "object",
                      properties: {
                        row: { type: "string" },
                        number: { type: "string" }
                      },
                      propertyOrdering: ["row", "number"]
                    },
                    auditorium: { type: "string" },
                    format: { type: "string" },
                    price: {
                      type: "object",
                      properties: {
                        amount: { type: "number" },
                        currency: { type: "string" }
                      },
                      propertyOrdering: ["amount", "currency"]
                    },
                    ticket_type: { type: "string" },
                    confirmation_number: { type: "string" },
                    barcode_visible: { type: "boolean" }
                  },
                  required: ["movie_title"],
                  propertyOrdering: ["movie_title", "theater_name", "theater_chain", "date", "showtime", "seat", "auditorium", "format", "price", "ticket_type", "confirmation_number", "barcode_visible"]
                }
              },
              image_quality: {
                type: "string",
                enum: ["good", "fair", "poor"]
              },
              confidence_score: { type: "number" },
              notes: { type: "string" }
            },
            required: ["chain_identified", "chain_confidence", "tickets", "confidence_score"],
            propertyOrdering: ["chain_identified", "chain_confidence", "tickets", "image_quality", "confidence_score", "notes"]
          }
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

  // Extract the text content from Gemini response
  const textContent = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  // With structured output (responseMimeType: "application/json"), Gemini returns raw JSON
  try {
    const parsed = JSON.parse(textContent);

    // Validate the structure
    if (!parsed.tickets || !Array.isArray(parsed.tickets)) {
      throw new Error('Invalid extraction format: missing tickets array');
    }

    console.log(`[scan-ticket] Chain identified: ${parsed.chain_identified} (confidence: ${parsed.chain_confidence})`);

    return {
      chain_identified: parsed.chain_identified || 'Unknown',
      chain_confidence: parsed.chain_confidence ?? 0,
      tickets: parsed.tickets,
      image_quality: parsed.image_quality || 'fair',
      confidence_score: parsed.confidence_score ?? 0.5,
      notes: parsed.notes || '',
    };
  } catch (parseError) {
    console.error('[scan-ticket] Failed to parse Gemini extraction response:', parseError);
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
      chainIdentified: extraction.chain_identified,
      chainConfidence: extraction.chain_confidence,
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
