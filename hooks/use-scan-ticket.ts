import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ExtractedTicket, ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';
import { processExtractedTickets } from '@/lib/ticket-processor';
import type { TMDBMovie } from '@/lib/tmdb.types';

// Debug flag - set to true to enable detailed logging
const DEBUG_AUTH = __DEV__;

// ============================================================================
// Types
// ============================================================================

/**
 * Raw TMDB match from the Edge Function
 * Note: The Edge Function returns a flattened structure, not the nested movie object
 */
interface EdgeFunctionTMDBMatch {
  id: number;
  title: string;
  poster_path?: string | null;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  confidence: number;
}

/**
 * Cleaned ticket data from Edge Function
 */
interface EdgeFunctionCleanedTicket {
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
}

/**
 * Ticket structure returned by the Edge Function
 * The Edge Function returns already-processed tickets with this structure
 */
interface EdgeFunctionTicket {
  extracted: ExtractedTicket;
  cleaned: EdgeFunctionCleanedTicket;
  tmdbMatch: EdgeFunctionTMDBMatch | null;
  needsReview: boolean;
}

/**
 * Response from the scan-ticket Edge Function
 */
export interface ScanTicketResponse {
  success?: boolean;
  tickets: EdgeFunctionTicket[] | ExtractedTicket[];
  scansRemaining: number;
  usedToday?: number;
  dailyLimit?: number;
  duplicatesRemoved?: number;
}

/**
 * Processed scan result ready for navigation
 */
export interface ProcessedScanResult {
  tickets: ProcessedTicket[];
  scansRemaining: number;
  duplicatesRemoved: number;
}

/**
 * Error types for scan ticket operations
 */
export type ScanTicketErrorType =
  | 'rate_limit'
  | 'extraction_failed'
  | 'network_error'
  | 'auth_error'
  | 'unknown';

/**
 * Hook result interface
 */
export interface UseScanTicketResult {
  scanTicket: (imageBase64: string, mimeType: string) => Promise<ProcessedScanResult>;
  isScanning: boolean;
  error: string | null;
  errorType: ScanTicketErrorType | null;
  clearError: () => void;
}

// ============================================================================
// Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<ScanTicketErrorType, string> = {
  rate_limit: "You've used all 3 scans today. Try again tomorrow.",
  extraction_failed: "Couldn't read the ticket. Try with better lighting.",
  network_error: "Connection failed. Check your internet.",
  auth_error: "Please sign in to scan tickets.",
  unknown: "Something went wrong. Please try again.",
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to scan ticket images using the scan-ticket Edge Function
 */
export function useScanTicket(): UseScanTicketResult {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ScanTicketErrorType | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setErrorType(null);
  }, []);

  const scanTicket = useCallback(async (
    imageBase64: string,
    mimeType: string
  ): Promise<ProcessedScanResult> => {
    setIsScanning(true);
    setError(null);
    setErrorType(null);

    try {
      // Verify user is authenticated before calling the Edge Function
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData?.session) {
        if (DEBUG_AUTH) {
          // TODO: Replace with Sentry error tracking
          console.error('[useScanTicket] No valid session found:', sessionError?.message);
        }
        setErrorType('auth_error');
        setError(ERROR_MESSAGES.auth_error);
        throw new Error(ERROR_MESSAGES.auth_error);
      }

      // Check if token is expired or about to expire (within 60 seconds)
      const expiresAt = sessionData.session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt && expiresAt - now < 60) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData?.session) {
          setErrorType('auth_error');
          setError(ERROR_MESSAGES.auth_error);
          throw new Error(ERROR_MESSAGES.auth_error);
        }
      }

      // Get the access token to pass explicitly
      const accessToken = sessionData.session.access_token;

      const { data, error: fnError } = await supabase.functions.invoke<ScanTicketResponse>(
        'scan-ticket',
        {
          body: {
            image: imageBase64,
            mimeType,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Handle function errors
      if (fnError) {
        // Parse error response for specific error types
        const errorMessage = fnError.message || '';

        // Try to get HTTP status from FunctionsHttpError
        // Supabase client may include status in the error context
        const fnErrorAny = fnError as any;
        const httpStatus = fnErrorAny.status || fnErrorAny.context?.status;

        // Try to parse response body for structured error info
        let errorBody: { error?: string; scansRemaining?: number } | null = null;
        try {
          if (fnErrorAny.context?.body) {
            errorBody = JSON.parse(fnErrorAny.context.body);
          }
        } catch {
          // Ignore JSON parse errors
        }

        // Check for rate limit (429) - check status, body, or message
        if (
          httpStatus === 429 ||
          errorBody?.error?.toLowerCase().includes('limit') ||
          errorBody?.scansRemaining === 0 ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429') ||
          errorMessage.includes('Daily scan limit')
        ) {
          setErrorType('rate_limit');
          setError(ERROR_MESSAGES.rate_limit);
          throw new Error(ERROR_MESSAGES.rate_limit);
        }

        // Check for extraction failure (422)
        if (
          httpStatus === 422 ||
          errorMessage.includes('extraction') ||
          errorMessage.includes('422')
        ) {
          setErrorType('extraction_failed');
          setError(ERROR_MESSAGES.extraction_failed);
          throw new Error(ERROR_MESSAGES.extraction_failed);
        }

        // Check for auth errors (401)
        if (
          httpStatus === 401 ||
          errorMessage.includes('auth') ||
          errorMessage.includes('401') ||
          errorMessage.includes('JWT') ||
          errorMessage.includes('Invalid JWT')
        ) {
          setErrorType('auth_error');
          setError(ERROR_MESSAGES.auth_error);
          throw new Error(ERROR_MESSAGES.auth_error);
        }

        // Check for network-related errors
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          setErrorType('network_error');
          setError(ERROR_MESSAGES.network_error);
          throw new Error(ERROR_MESSAGES.network_error);
        }

        // Unknown error
        setErrorType('unknown');
        setError(ERROR_MESSAGES.unknown);
        throw new Error(ERROR_MESSAGES.unknown);
      }

      // Validate response data
      if (!data) {
        setErrorType('unknown');
        setError(ERROR_MESSAGES.unknown);
        throw new Error(ERROR_MESSAGES.unknown);
      }

      // Process the extracted tickets
      const rawTickets = data.tickets || [];
      const originalCount = rawTickets.length;

      // Check if we have the new Edge Function format (with extracted/cleaned/tmdbMatch)
      // or the old format (just ExtractedTicket[])
      const isNewFormat = rawTickets.length > 0 &&
        'extracted' in rawTickets[0] &&
        'cleaned' in rawTickets[0];

      let processedTickets: ProcessedTicket[];
      let duplicatesRemoved: number;

      if (isNewFormat) {
        // New Edge Function format - transform to ProcessedTicket format
        const edgeFunctionTickets = rawTickets as EdgeFunctionTicket[];
        processedTickets = edgeFunctionTickets.map((ticket): ProcessedTicket => {
          const cleaned = ticket.cleaned;
          const tmdbMatchData = ticket.tmdbMatch;

          // Transform Edge Function TMDB match to expected ProcessedTicket format
          let tmdbMatch: TMDBMatch | null = null;
          if (tmdbMatchData) {
            // Build a TMDBMovie object from the flat Edge Function response
            const movie: TMDBMovie = {
              id: tmdbMatchData.id,
              title: tmdbMatchData.title,
              poster_path: tmdbMatchData.poster_path || null,
              backdrop_path: null,
              release_date: tmdbMatchData.release_date || '',
              overview: tmdbMatchData.overview || '',
              vote_average: tmdbMatchData.vote_average || 0,
              vote_count: 0,
              genre_ids: [],
            };

            tmdbMatch = {
              movie,
              confidence: tmdbMatchData.confidence,
              matchedTitle: cleaned.movieTitle || '',
              originalTitle: ticket.extracted.movie_title || '',
            };
          }

          return {
            movieTitle: cleaned.movieTitle,
            theaterName: cleaned.theaterName,
            theaterChain: cleaned.theaterChain,
            showtime: cleaned.showtime,
            date: cleaned.date,
            seatRow: cleaned.seatRow,
            seatNumber: cleaned.seatNumber,
            ticketType: cleaned.ticketType,
            priceAmount: cleaned.priceAmount,
            priceCurrency: cleaned.priceCurrency || 'USD',
            format: cleaned.format,
            confirmationNumber: cleaned.confirmationNumber,
            barcodeData: cleaned.barcodeData,
            auditorium: cleaned.auditorium,
            mpaaRating: null,
            tmdbMatch,
            processingErrors: ticket.needsReview ? ['Needs manual review'] : [],
            wasModified: false,
          };
        });

        // Use duplicates removed from API response if available
        duplicatesRemoved = data.duplicatesRemoved ?? 0;
      } else {
        // Old format - process locally (includes deduplication and TMDB matching)
        const extractedTickets = rawTickets as ExtractedTicket[];
        processedTickets = await processExtractedTickets(extractedTickets);

        // Calculate duplicates removed during processing
        duplicatesRemoved = originalCount - processedTickets.length;
      }

      return {
        tickets: processedTickets,
        scansRemaining: data.scansRemaining,
        duplicatesRemoved: Math.max(0, duplicatesRemoved),
      };
    } catch (err) {
      // Handle network errors
      if (err instanceof TypeError && err.message.includes('Network')) {
        setErrorType('network_error');
        setError(ERROR_MESSAGES.network_error);
        throw new Error(ERROR_MESSAGES.network_error);
      }

      // Re-throw if error is already set
      if (error) {
        throw err;
      }

      // Unknown error
      setErrorType('unknown');
      setError(ERROR_MESSAGES.unknown);
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, [error]);

  return {
    scanTicket,
    isScanning,
    error,
    errorType,
    clearError,
  };
}
