/**
 * Ticket Scan v2 — save-to-journey extraction.
 *
 * `saveTicketsToJourney` is a 1:1 extraction of the bulk-save logic in
 * `app/scan/review.tsx`'s `handleAddAllToWatched` (the `try` block) plus its
 * `mapTicketToJourneyData` / `convertTo24Hour` / `mapWatchFormat` helpers. It
 * is the v2-only consumer for this PR — the v1 `scan/review.tsx` path stays
 * byte-identical (deduping the two is tracked future tech-debt).
 *
 * Unlike v1 it does NOT show First Take modals or Alerts — the v2 flow handles
 * its own post-save navigation. It returns the counts + the first saved movie's
 * TMDB id so the caller can route (single matched -> journey card; else profile).
 */

import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { captureException, Sentry } from '@/lib/sentry';
import { addMovieToLibrary, updateJourney, getMovieByTmdbId } from '@/lib/movie-service';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import type { ProcessedTicket } from '@/lib/ticket-processor';
import type { JourneyUpdate, TicketScanInsert } from '@/lib/database.types';
import * as FileSystem from 'expo-file-system/legacy';

// ============================================================================
// Helpers (copied verbatim from app/scan/review.tsx)
// ============================================================================

/**
 * Convert 12-hour time format to 24-hour format for database storage
 * e.g., "7:00 PM" -> "19:00:00", "11:30 AM" -> "11:30:00"
 */
function convertTo24Hour(time12h: string): string {
  const match = time12h.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!match) return '00:00:00';

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

/**
 * Map watch format from ticket to database enum value
 */
function mapWatchFormat(format: string | null): JourneyUpdate['watch_format'] {
  if (!format) return null;
  const normalized = format.toLowerCase().replace(/\s+/g, '');

  if (normalized.includes('imax')) return 'imax';
  if (normalized.includes('dolby')) return 'dolby';
  if (normalized.includes('3d')) return '3d';
  if (normalized.includes('4dx') || normalized.includes('4d')) return '4dx';
  if (normalized.includes('screenx')) return 'screenx';
  if (normalized.includes('4k')) return '4k';

  return 'standard';
}

/**
 * Map ticket data to journey update fields
 */
function mapTicketToJourneyData(ticket: ProcessedTicket): JourneyUpdate {
  // Combine seat row and number into seat_location
  let seatLocation: string | null = null;
  if (ticket.seatRow && ticket.seatNumber) {
    seatLocation = `${ticket.seatRow}-${ticket.seatNumber}`;
  } else if (ticket.seatRow) {
    seatLocation = ticket.seatRow;
  } else if (ticket.seatNumber) {
    seatLocation = ticket.seatNumber;
  }

  // Build watched_at timestamp from date
  let watchedAt: string | null = null;
  if (ticket.date) {
    // ticket.date is in YYYY-MM-DD format
    watchedAt = `${ticket.date}T00:00:00Z`;
  }

  // Convert showtime to watch_time (HH:MM format)
  let watchTime: string | null = null;
  if (ticket.showtime) {
    const time24 = convertTo24Hour(ticket.showtime);
    // watch_time expects HH:MM format
    watchTime = time24.slice(0, 5);
  }

  return {
    watched_at: watchedAt,
    watch_time: watchTime,
    location_type: 'theater',
    location_name: ticket.theaterName,
    seat_location: seatLocation,
    ticket_price: ticket.priceAmount,
    auditorium: ticket.auditorium,
    watch_format: mapWatchFormat(ticket.format),
    ticket_id: ticket.confirmationNumber,
    theater_chain: ticket.theaterChain ?? null,
    ticket_type: ticket.ticketType ?? null,
    mpaa_rating: ticket.mpaaRating ?? null,
  };
}

// ============================================================================
// Public API
// ============================================================================

/** A successfully-saved movie, in the shape the First Take wizard iterates. */
export interface SavedMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export interface SaveTicketsResult {
  /** Number of tickets saved successfully. */
  succeeded: number;
  /** Number of tickets that failed to save. */
  failed: number;
  /** Number of valid (matched) tickets attempted. */
  attempted: number;
  /** TMDB id of the first successfully saved movie (for single-movie nav). */
  firstMovieTmdbId: number | null;
  /**
   * Every successfully-saved movie, in save order — the First Take wizard runs
   * one step-sequence per entry. Mirrors v1's `successfulMovies`.
   */
  savedMovies: SavedMovie[];
}

/**
 * Persist the matched tickets to the user's journey/library.
 *
 * Mirrors `handleAddAllToWatched` in `app/scan/review.tsx`: for each ticket with
 * a TMDB match it adds the movie to `user_movies` (status "watched"), updates
 * the journey row, best-effort persists the barcode + ticket photo, and inserts
 * the legacy theater-visit record. Cache invalidation matches v1.
 */
export async function saveTicketsToJourney(
  tickets: ProcessedTicket[],
  user: { id: string },
  queryClient: QueryClient,
  triggerAchievementCheck: () => void
): Promise<SaveTicketsResult> {
  // Filter tickets that have valid TMDB matches
  const validTickets = tickets.filter((t) => t.tmdbMatch !== null);

  if (validTickets.length === 0) {
    return { succeeded: 0, failed: 0, attempted: 0, firstMovieTmdbId: null, savedMovies: [] };
  }

  // Track journey IDs for navigation
  const createdJourneyIds: string[] = [];

  // Process each valid ticket
  const results = await Promise.allSettled(
    validTickets.map(async (ticket) => {
      const movie = ticket.tmdbMatch!.movie;
      let journeyId: string | null = null;

      // 1. Add movie to user_movies with status "watched"
      try {
        const userMovie = await addMovieToLibrary(user.id, movie, 'watched');
        journeyId = userMovie.id;
      } catch (error: any) {
        // If it's a duplicate, get the existing movie record
        if (error.message === 'DUPLICATE') {
          const existingMovie = await getMovieByTmdbId(user.id, movie.id);
          if (existingMovie) {
            journeyId = existingMovie.id;
          }
        } else {
          throw error;
        }
      }

      // 3. Build theater visit data (before journey update so we can add ticket_image_url)
      const theaterVisitData: Record<string, unknown> = {
        user_id: user.id,
        tmdb_id: movie.id,
        movie_title: movie.title,
        theater_name: ticket.theaterName,
        theater_chain: ticket.theaterChain,
        show_date: ticket.date,
        show_time: ticket.showtime ? convertTo24Hour(ticket.showtime).slice(0, 5) : null,
        seat_row: ticket.seatRow,
        seat_number: ticket.seatNumber,
        auditorium: ticket.auditorium,
        format: ticket.format,
        price_amount: ticket.priceAmount,
        price_currency: ticket.priceCurrency || 'USD',
        ticket_type: ticket.ticketType,
        confirmation_number: ticket.confirmationNumber,
        is_verified: true,
        confidence_score: ticket.tmdbMatch?.confidence || null,
        ticket_image_url: null,
      };

      // 2. Update journey with parsed ticket data + upload ticket photo
      if (journeyId) {
        const journeyData = mapTicketToJourneyData(ticket);
        try {
          await updateJourney(journeyId, journeyData);
          createdJourneyIds.push(journeyId);
        } catch (journeyError) {
          // Log but don't fail if journey update fails
          console.warn('Failed to update journey data:', journeyError);
          // Still track the ID for navigation
          createdJourneyIds.push(journeyId);
        }

        // Persist barcode data privately (non-blocking on failure)
        if (ticket.barcodeData) {
          try {
            const scanRecord: TicketScanInsert = {
              user_id: user.id,
              journey_id: journeyId,
              barcode_data: ticket.barcodeData,
            };
            const { error: barcodeError } = await (supabase as any)
              .from('ticket_scans')
              .insert(scanRecord);
            if (barcodeError) {
              // Non-blocking, best-effort. Breadcrumb only (no Sentry event) so a
              // regression is observable in the trail without adding error noise.
              Sentry.addBreadcrumb({
                category: 'scan',
                level: 'debug',
                message: 'ticket_scans barcode insert returned an error',
                data: { code: barcodeError.code, message: barcodeError.message },
              });
            }
          } catch (barcodeException) {
            // Non-blocking — barcode persistence is best-effort.
            Sentry.addBreadcrumb({
              category: 'scan',
              level: 'debug',
              message: 'ticket_scans barcode insert threw',
              data: {
                message:
                  barcodeException instanceof Error
                    ? barcodeException.message
                    : String(barcodeException),
              },
            });
          }
        }

        // Upload ticket photo if available (non-blocking on failure)
        if (ticket.ticketPhotoUri) {
          try {
            const fileName = `${user.id}/${journeyId}_ticket.jpg`;
            const base64 = await FileSystem.readAsStringAsync(ticket.ticketPhotoUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const { error: uploadError } = await supabase.storage
              .from('ticket-photos')
              .upload(fileName, bytes.buffer, {
                contentType: 'image/jpeg',
                cacheControl: '86400',
                upsert: true,
              });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('ticket-photos')
                .getPublicUrl(fileName);
              const ticketPhotoUrl = urlData.publicUrl;

              theaterVisitData.ticket_image_url = ticketPhotoUrl;

              // Append to journey_photos[]
              const { data: currentJourney } = await supabase
                .from('user_movies')
                .select('journey_photos')
                .eq('id', journeyId)
                .single();

              const existingPhotos: string[] =
                (currentJourney?.journey_photos as string[]) ?? [];
              await supabase
                .from('user_movies')
                .update({ journey_photos: [...existingPhotos, ticketPhotoUrl] })
                .eq('id', journeyId);
            }
          } catch (photoError) {
            captureException(
              photoError instanceof Error ? photoError : new Error(String(photoError)),
              { context: 'ticket-review-photo-upload' }
            );
            // Non-blocking — ticket data is more important than the photo
          }
        }
      }

      // 4. Insert theater visit record (legacy - keeping for backwards compatibility)
      const { error: visitError } = await (supabase as any)
        .from('theater_visits')
        .insert(theaterVisitData);

      if (visitError) {
        captureException(new Error(visitError.message), { context: 'ticket-review-theater-visit-insert' });
      }

      return { title: movie.title, journeyId };
    })
  );

  // Count successes
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0 && succeeded === 0) {
    throw new Error('All movies failed to save');
  }

  // Trigger achievement check once for the entire bulk operation
  triggerAchievementCheck();

  // Bust caches so profile + journey carousel + calendar reflect the new rows immediately
  invalidateUserMovieQueries(queryClient);
  for (const ticket of validTickets) {
    if (ticket.tmdbMatch?.movie.id) {
      queryClient.invalidateQueries({ queryKey: ['journeysByMovie', ticket.tmdbMatch.movie.id] });
    }
  }

  // Every successfully-saved movie, in save order (mirrors v1's
  // `successfulMovies`). The first entry doubles as the single-movie nav target.
  const savedMovies: SavedMovie[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      const movie = validTickets[i].tmdbMatch!.movie;
      savedMovies.push({ tmdbId: movie.id, title: movie.title, posterPath: movie.poster_path });
    }
  }
  const firstMovieTmdbId = savedMovies.length > 0 ? savedMovies[0].tmdbId : null;

  return { succeeded, failed, attempted: validTickets.length, firstMovieTmdbId, savedMovies };
}
