/**
 * Ticket Review Screen
 *
 * Displays scanned tickets for review before adding to watched list.
 * Allows editing individual tickets and bulk actions.
 * Matches ui-mocks/ticket_review.html design.
 */

import React, { useState, useCallback } from 'react';
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
import { addMovieToLibrary } from '@/lib/movie-service';
import { createFirstTake } from '@/lib/first-take-service';
import { supabase } from '@/lib/supabase';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

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
  const handleEditTicket = useCallback((ticket: ProcessedTicket) => {
    setEditingTicket(ticket);
    setIsEditModalVisible(true);
  }, []);

  // Handle close edit modal
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalVisible(false);
    setEditingTicket(null);
  }, []);

  // Handle save edited ticket
  const handleSaveTicket = useCallback((updatedTicket: ProcessedTicket) => {
    setTickets((prevTickets) =>
      prevTickets.map((t) =>
        t.confirmationNumber === updatedTicket.confirmationNumber ||
        (t.movieTitle === editingTicket?.movieTitle &&
          t.date === editingTicket?.date &&
          t.showtime === editingTicket?.showtime)
          ? updatedTicket
          : t
      )
    );
    handleCloseEditModal();
  }, [editingTicket, handleCloseEditModal]);

  // Handle manual TMDB search for unmatched tickets
  const handleSearchTMDB = useCallback((ticket: ProcessedTicket) => {
    // For now, just open edit modal. Could be enhanced to open search modal.
    handleEditTicket(ticket);
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
      router.replace('/(tabs)/profile');
    } catch (error) {
      // TODO: Replace with Sentry error tracking
      console.error('Error creating first take:', error);
      Alert.alert('Error', 'Failed to save your first take. Please try again.');
    } finally {
      setIsSubmittingFirstTake(false);
    }
  }, [user, firstTakeMovieInfo, router]);

  // Handle First Take modal close (skip without submitting)
  const handleFirstTakeClose = useCallback(() => {
    setShowFirstTakeModal(false);
    setFirstTakeMovieInfo(null);
    router.replace('/(tabs)/profile');
  }, [router]);

  // Handle Multi First Take modal complete
  const handleMultiFirstTakeComplete = useCallback(() => {
    setShowMultiFirstTakeModal(false);
    setMultiFirstTakeMovies([]);
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

    try {
      // Process each valid ticket
      const results = await Promise.allSettled(
        validTickets.map(async (ticket) => {
          const movie = ticket.tmdbMatch!.movie;

          // 1. Add movie to user_movies with status "watched"
          try {
            await addMovieToLibrary(user.id, movie, 'watched');
          } catch (error: any) {
            // If it's a duplicate, that's fine - the movie already exists
            if (error.message !== 'DUPLICATE') {
              throw error;
            }
          }

          // 2. Add theater visit record
          const theaterVisitData = {
            user_id: user.id,
            tmdb_id: movie.id,
            theater_name: ticket.theaterName,
            theater_chain: ticket.theaterChain,
            showtime: ticket.date && ticket.showtime
              ? `${ticket.date}T${convertTo24Hour(ticket.showtime)}`
              : null,
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
          };

          // Insert theater visit - the table might not exist yet, so we handle errors gracefully
          // Note: theater_visits table may not be defined in types yet, using 'any' cast
          const { error: visitError } = await (supabase as any)
            .from('theater_visits')
            .insert(theaterVisitData);

          if (visitError) {
            // Log but don't fail if theater_visits table doesn't exist
            console.warn('Could not save theater visit:', visitError.message);
          }

          return movie.title;
        })
      );

      // Count successes
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0 && succeeded === 0) {
        throw new Error('All movies failed to save');
      }

      // Only show First Take modals if the preference is enabled
      if (firstTakePromptEnabled) {
        // If exactly 1 movie was added successfully, show First Take modal
        if (succeeded === 1 && validTickets.length === 1) {
          const movie = validTickets[0].tmdbMatch!.movie;
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

      // For partial failures with only 1 success, or no successes, show success alert and navigate
      const message = failed > 0
        ? `Added ${succeeded} movie${succeeded > 1 ? 's' : ''} to your watched list. ${failed} failed.`
        : `Added ${succeeded} movie${succeeded > 1 ? 's' : ''} to your watched list!`;

      Alert.alert(
        'Success',
        message,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/profile'),
          },
        ]
      );
    } catch (error) {
      // TODO: Replace with Sentry error tracking
      console.error('Error adding movies:', error);
      Alert.alert(
        'Error',
        'Failed to add movies to your watched list. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  }, [tickets, router, user, firstTakePromptEnabled]);

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
            <Pressable
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
              onPress={handleGoBack}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.ticketList}>
            {tickets.map((ticket, index) => (
              <TicketReviewCard
                key={ticket.confirmationNumber || `ticket-${index}`}
                ticket={ticket}
                onEdit={() => handleEditTicket(ticket)}
                onSearchTMDB={() => handleSearchTMDB(ticket)}
              />
            ))}
          </View>
        )}
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
