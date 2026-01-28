import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  tickets: ProcessedTicket[];
  extractionConfidence: number;
  notes: string;
}

interface RateLimitResult {
  allowed: boolean;
  scans_remaining: number;
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

const EXTRACTION_PROMPT = `You are a movie ticket data extraction assistant. Analyze this image of movie ticket(s) and extract ALL ticket information you can find.

For EACH ticket visible in the image, extract into JSON:
{
  "tickets": [
    {
      "movie_title": "exact title from ticket",
      "theater_name": "full theater name",
      "theater_chain": "chain name or null",
      "date": "YYYY-MM-DD",
      "showtime": "HH:MM (24hr)",
      "seat": { "row": "letter/number or null", "number": "number or null" },
      "auditorium": "number or null",
      "format": "IMAX/Dolby/3D/Standard or null",
      "price": { "amount": number or null, "currency": "USD" },
      "ticket_type": "Adult/Child/Senior or null",
      "confirmation_number": "string or null",
      "barcode_visible": boolean
    }
  ],
  "image_quality": "good/fair/poor",
  "confidence_score": 0.0-1.0,
  "notes": "observations"
}
Return ONLY valid JSON.`;

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
      // TODO: Add error tracking (e.g., Sentry)
      return null;
    }

    const data: TMDBSearchResponse = await response.json();

    if (data.results.length === 0) {
      // Try without year constraint
      if (year) {
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
    // TODO: Add error tracking (e.g., Sentry)
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
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    // TODO: Add error tracking (e.g., Sentry)
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const geminiResponse = await response.json();

  // Extract the text content from Gemini response
  const textContent = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  // Parse the JSON from the response
  // Gemini might wrap it in markdown code blocks
  let jsonStr = textContent.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

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
    // TODO: Add error tracking (e.g., Sentry)
    throw new Error('Failed to parse ticket extraction response');
  }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { image, mimeType }: ScanTicketRequest = await req.json();

    if (!image || typeof image !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Image data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validMimeTypes = ['image/heic', 'image/jpeg', 'image/png', 'image/webp'];
    if (!mimeType || !validMimeTypes.includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: 'Valid mimeType is required (image/heic, image/jpeg, image/png, image/webp)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      // TODO: Add error tracking (e.g., Sentry)
      throw new Error('Failed to check rate limit');
    }

    const rateLimitResult = rateLimit as RateLimitResult;

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Daily scan limit reached',
          scansRemaining: 0,
          resetAt: rateLimitResult.reset_at,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract ticket data using Gemini
    let extraction: GeminiExtraction;
    try {
      extraction = await extractWithGemini(image, mimeType, GEMINI_API_KEY);
    } catch (geminiError) {
      // TODO: Add error tracking (e.g., Sentry)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to extract ticket information. Please try with a clearer image.',
          scansRemaining: rateLimitResult.scans_remaining,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each extracted ticket
    const processedTickets: ProcessedTicket[] = [];

    for (const extractedTicket of extraction.tickets) {
      const cleaned = cleanTicket(extractedTicket);

      // Get year from ticket date for TMDB search
      const year = cleaned.date ? cleaned.date.split('-')[0] : null;

      // Search TMDB for matching movie
      const tmdbMatch = await searchTMDB(cleaned.movieTitle, year, TMDB_API_KEY);

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
      tickets: deduplicatedTickets,
      extractionConfidence: extraction.confidence_score,
      notes: extraction.notes,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // TODO: Add error tracking (e.g., Sentry)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
