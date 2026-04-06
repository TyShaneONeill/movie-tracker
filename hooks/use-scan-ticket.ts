import { useState, useCallback } from 'react';
import { Image as RNImage, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import type { ExtractedTicket, ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';
import { processExtractedTickets } from '@/lib/ticket-processor';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { analytics } from '@/lib/analytics';
import { useUserPreferences } from '@/hooks/use-user-preferences';

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
  scanTicket: (imageBase64: string, mimeType: string, imageUri?: string) => Promise<ProcessedScanResult>;
  isScanning: boolean;
  error: string | null;
  errorType: ScanTicketErrorType | null;
  clearError: () => void;
}

// ============================================================================
// Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<ScanTicketErrorType, string> = {
  rate_limit: "You've reached your daily scan limit. Try again tomorrow.",
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
  const { preferences } = useUserPreferences();

  const clearError = useCallback(() => {
    setError(null);
    setErrorType(null);
  }, []);

  const scanTicket = useCallback(async (
    imageBase64: string,
    mimeType: string,
    imageUri?: string
  ): Promise<ProcessedScanResult> => {
    setIsScanning(true);
    setError(null);
    setErrorType(null);
    analytics.track('scan:attempt');

    try {
      // Verify user is authenticated before calling the Edge Function
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData?.session) {
        captureException(sessionError instanceof Error ? sessionError : new Error(String(sessionError ?? 'No active session')), { context: 'scan-ticket-auth' });
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
        const fnErrorAny = fnError as any;

        // Try multiple ways to get HTTP status and body from Supabase FunctionsHttpError
        const httpStatus = fnErrorAny.status || fnErrorAny.context?.status;

        let errorBody: any = null;
        try {
          // Method 1: context.json() (FunctionsHttpError in newer Supabase JS)
          if (typeof fnErrorAny.context?.json === 'function') {
            errorBody = await fnErrorAny.context.json();
          }
          // Method 2: context.body as string
          else if (fnErrorAny.context?.body) {
            errorBody = typeof fnErrorAny.context.body === 'string'
              ? JSON.parse(fnErrorAny.context.body)
              : fnErrorAny.context.body;
          }
          // Method 3: error.data
          else if (fnErrorAny.data) {
            errorBody = typeof fnErrorAny.data === 'string'
              ? JSON.parse(fnErrorAny.data)
              : fnErrorAny.data;
          }
        } catch {
          // Body parsing failed, continue with other checks
        }

        const errorMessage = fnError.message || '';

        // Check for rate limit (429) - check parsed body first, then status, then message strings
        if (
          errorBody?.scansRemaining === 0 ||
          errorBody?.error?.toLowerCase().includes('limit') ||
          httpStatus === 429 ||
          errorMessage.includes('429') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('Daily scan limit')
        ) {
          const limit = errorBody?.dailyLimit || 'your daily';
          setErrorType('rate_limit');
          setError(`You've reached ${typeof limit === 'number' ? `your ${limit}` : limit} scan limit. Try again tomorrow.`);
          analytics.track('scan:fail', { reason: 'rate_limit' });
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
          analytics.track('scan:fail', { reason: 'extraction_failed' });
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
          analytics.track('scan:fail', { reason: 'auth_error' });
          throw new Error(ERROR_MESSAGES.auth_error);
        }

        // Check for network-related errors
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          setErrorType('network_error');
          setError(ERROR_MESSAGES.network_error);
          analytics.track('scan:fail', { reason: 'network_error' });
          throw new Error(ERROR_MESSAGES.network_error);
        }

        // Unknown error
        setErrorType('unknown');
        setError(ERROR_MESSAGES.unknown);
        analytics.track('scan:fail', { reason: 'unknown' });
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

        // Capture bounding boxes parallel to processedTickets for cropping step
        type BoundingBox = { x_min: number; y_min: number; x_max: number; y_max: number };
        const boundingBoxes: (BoundingBox | null)[] = [];

        processedTickets = edgeFunctionTickets.map((ticket): ProcessedTicket => {
          const cleaned = ticket.cleaned;
          const tmdbMatchData = ticket.tmdbMatch;

          // Capture bounding box for cropping step
          const box = ticket.extracted.bounding_box ?? null;
          boundingBoxes.push(box);

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
            ticketPhotoUri: null,
          };
        });

        // Crop and attach ticket photos if we have the original image URI (native only)
        if (imageUri && Platform.OS !== 'web') {
          if (preferences?.cropTicketPhotos !== false) {
            try {
              const { width: imgWidth, height: imgHeight } = await new Promise<{ width: number; height: number }>(
                (resolve, reject) => {
                  RNImage.getSize(imageUri, (w, h) => resolve({ width: w, height: h }), reject);
                }
              );

              const PADDING = 0.05;

              await Promise.all(
                processedTickets.map(async (ticket, i) => {
                  const box = boundingBoxes[i];

                  if (box) {
                    const cropX = Math.max(0, (box.x_min / 1000) * imgWidth * (1 - PADDING));
                    const cropY = Math.max(0, (box.y_min / 1000) * imgHeight * (1 - PADDING));
                    const cropW = Math.min(
                      imgWidth - cropX,
                      ((box.x_max - box.x_min) / 1000) * imgWidth * (1 + PADDING * 2)
                    );
                    const cropH = Math.min(
                      imgHeight - cropY,
                      ((box.y_max - box.y_min) / 1000) * imgHeight * (1 + PADDING * 2)
                    );

                    if (cropW > 0 && cropH > 0) {
                      try {
                        const cropped = await ImageManipulator.manipulateAsync(
                          imageUri,
                          [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
                          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
                        );
                        ticket.ticketPhotoUri = cropped.uri;
                      } catch {
                        ticket.ticketPhotoUri = imageUri;
                      }
                    } else {
                      ticket.ticketPhotoUri = imageUri;
                    }
                  } else {
                    ticket.ticketPhotoUri = imageUri;
                  }
                })
              );
            } catch (cropErr) {
              captureException(cropErr instanceof Error ? cropErr : new Error(String(cropErr)), {
                context: 'scan-ticket-crop',
              });
              for (const ticket of processedTickets) {
                ticket.ticketPhotoUri = imageUri;
              }
            }
          } else {
            // Crop disabled — attach full image to all tickets
            for (const ticket of processedTickets) {
              ticket.ticketPhotoUri = imageUri;
            }
          }
        }

        // Use duplicates removed from API response if available
        duplicatesRemoved = data.duplicatesRemoved ?? 0;
      } else {
        // Old format - process locally (includes deduplication and TMDB matching)
        const extractedTickets = rawTickets as ExtractedTicket[];
        processedTickets = await processExtractedTickets(extractedTickets);

        // Calculate duplicates removed during processing
        duplicatesRemoved = originalCount - processedTickets.length;
      }

      // Track success for each matched ticket
      for (const ticket of processedTickets) {
        if (ticket.tmdbMatch?.movie?.id) {
          analytics.track('scan:success', { tmdb_id: ticket.tmdbMatch.movie.id });
        }
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
        analytics.track('scan:fail', { reason: 'network_error' });
        throw new Error(ERROR_MESSAGES.network_error);
      }

      // Re-throw if error is already set
      if (error) {
        throw err;
      }

      // Unknown error
      setErrorType('unknown');
      setError(ERROR_MESSAGES.unknown);
      analytics.track('scan:fail', { reason: 'unknown' });
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

// ============================================================================
// Scan Status Utility
// ============================================================================

const DEFAULT_DAILY_SCAN_LIMIT = 3;
const PREMIUM_DAILY_SCAN_LIMIT = 20;

/**
 * Fetch the current scan status for the authenticated user
 * Returns the number of scans remaining today
 */
export async function fetchScanStatus(): Promise<{
  scansRemaining: number;
  usedToday: number;
  dailyLimit: number;
  bonusScans: number;
}> {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session?.user) {
    return {
      scansRemaining: DEFAULT_DAILY_SCAN_LIMIT,
      usedToday: 0,
      dailyLimit: DEFAULT_DAILY_SCAN_LIMIT,
      bonusScans: 0,
    };
  }

  const userId = sessionData.session.user.id;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Note: scan_usage table may not be in generated types, using type assertion
  const { data, error } = await (supabase as any)
    .from('scan_usage')
    .select('daily_count, last_scan_date, bypass_rate_limit, bonus_scans')
    .eq('user_id', userId)
    .single() as { data: { daily_count: number; last_scan_date: string; bypass_rate_limit: boolean; bonus_scans: number | null } | null; error: any };

  // Fetch user's account tier for correct limit
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_tier')
    .eq('id', userId)
    .single();

  const accountTier = profile?.account_tier || 'free';
  const baseDailyLimit = accountTier === 'dev' ? 999 : accountTier === 'premium' ? PREMIUM_DAILY_SCAN_LIMIT : DEFAULT_DAILY_SCAN_LIMIT;

  if (error || !data) {
    // No record means user hasn't scanned yet - they have full limit
    return {
      scansRemaining: baseDailyLimit,
      usedToday: 0,
      dailyLimit: baseDailyLimit,
      bonusScans: 0,
    };
  }

  // If bypass is enabled, show unlimited
  if (data.bypass_rate_limit) {
    return {
      scansRemaining: 999,
      usedToday: data.daily_count || 0,
      dailyLimit: 999,
      bonusScans: 0,
    };
  }

  // If last scan was on a different day, count resets (bonus included)
  if (data.last_scan_date !== today) {
    return {
      scansRemaining: baseDailyLimit,
      usedToday: 0,
      dailyLimit: baseDailyLimit,
      bonusScans: 0,
    };
  }

  const usedToday = data.daily_count || 0;
  const bonusScans = data.bonus_scans || 0;
  const effectiveLimit = baseDailyLimit + bonusScans;
  const scansRemaining = Math.max(0, effectiveLimit - usedToday);

  return {
    scansRemaining,
    usedToday,
    dailyLimit: baseDailyLimit,
    bonusScans,
  };
}
