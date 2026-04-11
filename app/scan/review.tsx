/**
 * Ticket Review Screen
 *
 * Displays scanned tickets for review before adding to watched list.
 * Allows editing individual tickets and bulk actions.
 * Matches ui-mocks/ticket_review.html design.
 */

import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { TicketReviewCard } from '@/components/ticket-review-card';
import { TicketEditModal } from '@/components/ticket-edit-modal';
import { FirstTakeModal } from '@/components/first-take-modal';
import { MultiFirstTakeModal, MovieInfo } from '@/components/multi-first-take-modal';
import type { ProcessedTicket } from '@/lib/ticket-processor';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { addMovieToLibrary, updateJourney, getMovieByTmdbId } from '@/lib/movie-service';
import { createFirstTake } from '@/lib/first-take-service';
import { supabase } from '@/lib/supabase';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { JourneyUpdate, TicketScanInsert } from '@/lib/database.types';
import * as FileSystem from 'expo-file-system/legacy';
import { captureException } from '@/lib/sentry';
import { useAchievementCheck } from '@/lib/achievement-context';
import { ContentContainer } from '@/components/content-container';

// ============================================================================
// Helpers
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
// Types
// ============================================================================

// Route params for ticket review screen
// Note: expo-router expects params as Record<string, string | string[]>

// ============================================================================
// Component
// ============================================================================

export default function TicketReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  // Achievement check (fire-and-forget after bulk operations)
  const { triggerAchievementCheck } = useAchievementCheck();
  const queryClient = useQueryClient();

  // User preferences hook (for First Take prompt setting)
  const { preferences } = useUserPreferences();
  // Default to true if preference is undefined (backwards compatibility)
  const firstTakePromptEnabled = preferences?.firstTakePromptEnabled ?? true;

  // Parse route params
  const ticketsParam = typeof params.tickets === 'string' ? params.tickets : '';
  const scansRemainingParam = typeof params.scansRemaining === 'string' ? params.scansRemaining : '0';
  const duplicatesRemovedParam = typeof params.duplicatesRemoved === 'string' ? params.duplicatesRemoved : '0';

  const initialTickets: ProcessedTicket[] = ticketsParam
    ? JSON.parse(ticketsParam)
    : [];
  const scansRemaining = parseInt(scansRemainingParam, 10) || 0;
  const duplicatesRemoved = parseInt(duplicatesRemovedParam, 10) || 0;

  // State
  const [tickets, setTickets] = useState<ProcessedTicket[]>(initialTickets);
  const [showDuplicateNotice, setShowDuplicateNotice] = useState(duplicatesRemoved > 0);
  const [editingTicket, setEditingTicket] = useState<ProcessedTicket | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // First Take modal state (for single movie)
  const [showFirstTakeModal, setShowFirstTakeModal] = useState(false);
  const [firstTakeMovieInfo, setFirstTakeMovieInfo] = useState<{
    tmdbId: number;
    title: string;
    posterPath: string | null;
  } | null>(null);
  const [isSubmittingFirstTake, setIsSubmittingFirstTake] = useState(false);

  // Multi First Take modal state (for multiple movies)
  const [showMultiFirstTakeModal, setShowMultiFirstTakeModal] = useState(false);
  const [multiFirstTakeMovies, setMultiFirstTakeMovies] = useState<MovieInfo[]>([]);

  // Journey ID and TMDB ID for navigation after single movie scan
  const [singleJourneyId, setSingleJourneyId] = useState<string | null>(null);
  const [singleTmdbId, setSingleTmdbId] = useState<number | null>(null);

  // Count movies found
  const moviesFound = tickets.filter((t) => t.tmdbMatch !== null).length;

  // Handle navigation back
  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  // Handle dismiss duplicate notice
  const handleDismissNotice = useCallback(() => {
    setShowDuplicateNotice(false);
  }, []);

  // Handle edit ticket
  const handleEditTicket = useCallback((ticket: ProcessedTicket, index: number) => {
    setEditingTicket(ticket);
    setEditingIndex(index);
    setIsEditModalVisible(true);
  }, []);

  // Handle close edit modal
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalVisible(false);
    setEditingTicket(null);
    setEditingIndex(-1);
  }, []);

  // Handle save edited ticket — update by index to avoid null===null matching bugs
  const handleSaveTicket = useCallback((updatedTicket: ProcessedTicket) => {
    setTickets((prevTickets) =>
      prevTickets.map((t, i) => i === editingIndex ? updatedTicket : t)
    );
    handleCloseEditModal();
  }, [editingIndex, handleCloseEditModal]);

  // Handle manual TMDB search for unmatched tickets
  const handleSearchTMDB = useCallback((ticket: ProcessedTicket, index: number) => {
    // For now, just open edit modal. Could be enhanced to open search modal.
    handleEditTicket(ticket, index);
  }, [handleEditTicket]);

  // Handle First Take modal submission
  const handleFirstTakeSubmit = useCallback(async (data: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
  }) => {
    if (!user || !firstTakeMovieInfo) return;

    setIsSubmittingFirstTake(true);
    try {
      await createFirstTake(user.id, {
        tmdbId: firstTakeMovieInfo.tmdbId,
        movieTitle: firstTakeMovieInfo.title,
        posterPath: firstTakeMovieInfo.posterPath,
        reactionEmoji: '',
        quoteText: data.quoteText,
        isSpoiler: data.isSpoiler,
        rating: data.rating,
      });
      setShowFirstTakeModal(false);
      setFirstTakeMovieInfo(null);
      triggerAchievementCheck();
      // Navigate to the carousel screen using TMDB ID so rating + date are visible immediately
      if (singleTmdbId) {
        router.replace(`/journey/movie/${singleTmdbId}`);
      } else {
        router.replace('/(tabs)/profile');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_FIRST_TAKE') {
        // Already rated this movie — navigate silently, no error needed
        setShowFirstTakeModal(false);
        setFirstTakeMovieInfo(null);
        if (singleTmdbId) {
          router.replace(`/journey/movie/${singleTmdbId}`);
        } else {
          router.replace('/(tabs)/profile');
        }
        return;
      }
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'ticket-review-first-take-submit' });
      Alert.alert('Error', 'Failed to save your first take. Please try again.');
    } finally {
      setIsSubmittingFirstTake(false);
    }
  }, [user, firstTakeMovieInfo, router, singleTmdbId, triggerAchievementCheck]);

  // Handle First Take modal close (skip without submitting)
  const handleFirstTakeClose = useCallback(() => {
    setShowFirstTakeModal(false);
    setFirstTakeMovieInfo(null);
    // Navigate to the carousel screen using TMDB ID so rating + date are visible immediately
    if (singleTmdbId) {
      router.replace(`/journey/movie/${singleTmdbId}`);
    } else {
      router.replace('/(tabs)/profile');
    }
  }, [router, singleTmdbId]);

  // Handle Multi First Take modal complete
  const handleMultiFirstTakeComplete = useCallback(() => {
    setShowMultiFirstTakeModal(false);
    setMultiFirstTakeMovies([]);
    // For multiple movies, go to profile to see all journeys
    router.replace('/(tabs)/profile');
  }, [router]);

  // Handle add all to watched
  const handleAddAllToWatched = useCallback(async () => {
    if (!user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to add movies to your watched list.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Filter tickets that have valid TMDB matches
    const validTickets = tickets.filter((t) => t.tmdbMatch !== null);

    if (validTickets.length === 0) {
      Alert.alert(
        'No Valid Movies',
        'There are no movies with valid matches to add. Please review the unmatched tickets first.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);

    // Track journey IDs for navigation
    let createdJourneyIds: string[] = [];

    try {
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
                await (supabase as any).from('ticket_scans').insert(scanRecord);
              } catch {
                // Non-blocking — barcode persistence is best-effort
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

      // Bust caches so profile + journey carousel reflect the new rows immediately
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
      for (const ticket of validTickets) {
        if (ticket.tmdbMatch?.movie.id) {
          queryClient.invalidateQueries({ queryKey: ['journeysByMovie', ticket.tmdbMatch.movie.id] });
        }
      }

      // Only show First Take modals if the preference is enabled
      if (firstTakePromptEnabled) {
        // If exactly 1 movie was added successfully, show First Take modal
        if (succeeded === 1 && validTickets.length === 1) {
          const movie = validTickets[0].tmdbMatch!.movie;
          // Set journey ID + TMDB ID for navigation after First Take modal
          if (createdJourneyIds.length > 0) {
            setSingleJourneyId(createdJourneyIds[0]);
            setSingleTmdbId(movie.id);
          }
          setFirstTakeMovieInfo({
            tmdbId: movie.id,
            title: movie.title,
            posterPath: movie.poster_path,
          });
          setShowFirstTakeModal(true);
          return; // Don't show alert or navigate yet - modal will handle it
        }

        // If 2+ movies were added successfully, show Multi First Take modal
        if (succeeded >= 2) {
          // Get the successfully added movies
          const successfulMovies: MovieInfo[] = [];
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              const movie = validTickets[index].tmdbMatch!.movie;
              successfulMovies.push({
                tmdbId: movie.id,
                title: movie.title,
                posterPath: movie.poster_path,
              });
            }
          });

          if (successfulMovies.length >= 2) {
            setMultiFirstTakeMovies(successfulMovies);
            setShowMultiFirstTakeModal(true);
            return; // Don't show alert or navigate yet - modal will handle it
          }
        }
      }

      // For single movie without First Take modal, navigate to journey card
      // For multiple movies or failures, navigate to profile
      const navigateToJourney = succeeded === 1 && createdJourneyIds.length === 1;
      const message = failed > 0
        ? `Added ${succeeded} movie${succeeded > 1 ? 's' : ''} to your watched list. ${failed} failed.`
        : `Added ${succeeded} movie${succeeded > 1 ? 's' : ''} to your watched list!`;

      Alert.alert(
        'Success',
        message,
        [
          {
            text: navigateToJourney ? 'View Journey' : 'OK',
            onPress: () => {
              if (navigateToJourney) {
                router.replace(`/journey/movie/${validTickets[0].tmdbMatch!.movie.id}`);
              } else {
                router.replace('/(tabs)/profile');
              }
            },
          },
        ]
      );
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'ticket-review-add-all-to-watched' });
      Alert.alert(
        'Error',
        'Failed to add movies to your watched list. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  }, [tickets, router, user, firstTakePromptEnabled, triggerAchievementCheck]);

  return (
    <View style={styles.container}>
      {/* Header with blur */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <BlurView
          intensity={80}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={handleGoBack}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
            >
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
            <View style={styles.headerTitle}>
              <Text style={styles.title}>Review Tickets</Text>
              <Text style={styles.subtitle}>
                {moviesFound} {moviesFound === 1 ? 'match' : 'matches'} found
              </Text>
            </View>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{scansRemaining} scans left</Text>
          </View>
        </View>
      </View>

      {/* Duplicate notice */}
      {showDuplicateNotice && (
        <Pressable style={styles.duplicateNotice} onPress={handleDismissNotice}>
          <Text style={styles.duplicateNoticeText}>
            <Text style={styles.duplicateNoticeLabel}>Note: </Text>
            {duplicatesRemoved} duplicate ticket{duplicatesRemoved > 1 ? 's were' : ' was'} removed.
          </Text>
          <Text style={styles.dismissIcon}>✕</Text>
        </Pressable>
      )}

      {/* Ticket list */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom }, // Space for action bar
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ContentContainer>
          {tickets.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Unable to Scan Ticket</Text>
              <Text style={styles.emptyStateSubtitle}>
                We could not find ticket information in this image.{' '}
                {scansRemaining > 0
                  ? `You have ${scansRemaining} scan${scansRemaining === 1 ? '' : 's'} left today.`
                  : 'You have no scans left today.'}
              </Text>
              <Text style={styles.emptyStateTip}>
                Tip: Make sure the ticket is well-lit and text is clearly visible.
              </Text>
              {scansRemaining > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.retryButtonPressed,
                  ]}
                  onPress={handleGoBack}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </Pressable>
              ) : (
                <View style={styles.emptyStateButtons}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed && styles.retryButtonPressed,
                    ]}
                    onPress={() => router.push('/search')}
                  >
                    <Text style={styles.retryButtonText}>Manually Add Movie</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    onPress={handleGoBack}
                  >
                    <Text style={styles.secondaryButtonText}>Go Back</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.ticketList}>
              {tickets.map((ticket, index) => (
                <TicketReviewCard
                  key={ticket.confirmationNumber || `ticket-${index}`}
                  ticket={ticket}
                  onEdit={() => handleEditTicket(ticket, index)}
                  onSearchTMDB={() => handleSearchTMDB(ticket, index)}
                />
              ))}
            </View>
          )}
        </ContentContainer>
      </ScrollView>

      {/* Bottom action bar */}
      {tickets.length > 0 && (
        <View
          style={[
            styles.actionBar,
            { paddingBottom: Math.max(Spacing.md, insets.bottom) },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              styles.addButtonFullWidth,
              pressed && styles.addButtonPressed,
              isSaving && styles.addButtonDisabled,
            ]}
            onPress={handleAddAllToWatched}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>Add to Collection</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Edit modal */}
      <TicketEditModal
        visible={isEditModalVisible}
        ticket={editingTicket}
        onClose={handleCloseEditModal}
        onSave={handleSaveTicket}
      />

      {/* First Take modal - shown after single movie add */}
      <FirstTakeModal
        visible={showFirstTakeModal}
        onClose={handleFirstTakeClose}
        onSubmit={handleFirstTakeSubmit}
        movieTitle={firstTakeMovieInfo?.title ?? ''}
        moviePosterUrl={
          firstTakeMovieInfo?.posterPath
            ? getTMDBImageUrl(firstTakeMovieInfo.posterPath, 'w342') ?? undefined
            : undefined
        }
        isSubmitting={isSubmittingFirstTake}
      />

      {/* Multi First Take modal - shown after multiple movies add */}
      <MultiFirstTakeModal
        visible={showMultiFirstTakeModal}
        movies={multiFirstTakeMovies}
        onComplete={handleMultiFirstTakeComplete}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },

  // Header
  header: {
    position: 'relative',
    zIndex: 50,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backIcon: {
    fontSize: 24,
    color: Colors.dark.text,
  },
  headerTitle: {
    gap: 2,
  },
  title: {
    ...Typography.display.h4,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
  },
  badge: {
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  badgeText: {
    ...Typography.body.xs,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },

  // Duplicate notice
  duplicateNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.dark.border,
  },
  duplicateNoticeText: {
    ...Typography.body.xs,
    color: Colors.dark.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  duplicateNoticeLabel: {
    color: Colors.dark.text,
    fontStyle: 'normal',
  },
  dismissIcon: {
    fontSize: 14,
    color: Colors.dark.textTertiary,
    marginLeft: Spacing.sm,
  },

  // Scroll view
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },

  // Ticket list
  ticketList: {
    gap: Spacing.md,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl * 2,
  },
  emptyStateTitle: {
    ...Typography.display.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtitle: {
    ...Typography.body.base,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyStateTip: {
    ...Typography.body.sm,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: Spacing.lg,
  },
  emptyStateButtons: {
    gap: Spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  retryButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    ...Typography.button.primary,
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    ...Shadows.lg,
  },
  addButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  addButtonFullWidth: {
    width: '100%',
  },
  addButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  addButtonText: {
    ...Typography.button.primary,
    color: '#fff',
  },
});
