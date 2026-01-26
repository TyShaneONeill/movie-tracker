/**
 * Ticket Review Card Component
 *
 * Displays a single ticket card with status indicator and movie details.
 * Three status variants: match (green), review (amber), error (red).
 * Matches ui-mocks/ticket_review.html styling.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { ProcessedTicket } from '@/lib/ticket-processor';

// ============================================================================
// Types
// ============================================================================

export type TicketStatus = 'match' | 'review' | 'error';

export interface TicketReviewCardProps {
  ticket: ProcessedTicket;
  onEdit: () => void;
  onSearchTMDB?: () => void; // for unmatched tickets
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS = {
  match: '#10b981',   // Emerald 500
  review: '#fbbf24',  // Amber 400
  error: '#ef4444',   // Red 500
};

const CONFIDENCE_THRESHOLD = 0.7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the status of a ticket based on TMDB match confidence
 */
function getTicketStatus(ticket: ProcessedTicket): TicketStatus {
  if (!ticket.tmdbMatch) {
    return 'error';
  }

  if (ticket.tmdbMatch.confidence >= CONFIDENCE_THRESHOLD) {
    return 'match';
  }

  return 'review';
}

/**
 * Format date and time for display
 * Note: Appending T12:00:00 to the date string avoids timezone issues where
 * dates like "2025-05-25" parsed as UTC would show as May 24th in local time
 */
function formatDateTime(date: string | null, time: string | null): string {
  if (!date && !time) return '';

  let formattedDate = '';
  if (date) {
    try {
      // Append T12:00:00 to avoid timezone issues when parsing date-only strings
      const dateObj = new Date(date + 'T12:00:00');
      formattedDate = dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      formattedDate = date;
    }
  }

  let formattedTime = time || '';

  if (formattedDate && formattedTime) {
    return `${formattedDate} · ${formattedTime}`;
  }

  return formattedDate || formattedTime || '';
}

/**
 * Format seat info for display
 */
function formatSeat(row: string | null, seat: string | null): string | null {
  if (!row && !seat) return null;
  if (row && seat) return `Row ${row}, Seat ${seat}`;
  if (row) return `Row ${row}`;
  if (seat) return `Seat ${seat}`;
  return null;
}

/**
 * Format price for display
 */
function formatPrice(amount: number | null | undefined, currency: string): string | null {
  if (amount == null || isNaN(amount)) return null;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  });

  return formatter.format(amount);
}

// ============================================================================
// Status Icons
// ============================================================================

function CheckIcon() {
  return (
    <View style={styles.statusIcon}>
      <Text style={[styles.statusIconText, { color: STATUS_COLORS.match }]}>
        ✓
      </Text>
    </View>
  );
}

function WarningIcon() {
  return (
    <View style={styles.statusIcon}>
      <Text style={[styles.statusIconText, { color: STATUS_COLORS.review }]}>
        ⚠
      </Text>
    </View>
  );
}

function ErrorIcon() {
  return (
    <View style={styles.statusIcon}>
      <Text style={[styles.statusIconText, { color: STATUS_COLORS.error }]}>
        ✕
      </Text>
    </View>
  );
}

function FilmPlaceholderIcon() {
  return (
    <View style={styles.filmIconContainer}>
      <Text style={styles.filmIconText}>🎬</Text>
    </View>
  );
}

// ============================================================================
// Component
// ============================================================================

export function TicketReviewCard({
  ticket,
  onEdit,
  onSearchTMDB,
}: TicketReviewCardProps) {
  const status = getTicketStatus(ticket);
  const statusColor = STATUS_COLORS[status];

  // Get display data
  const movieTitle = ticket.tmdbMatch?.movie.title || ticket.movieTitle || 'Unknown Movie';
  const posterPath = ticket.tmdbMatch?.movie.poster_path || null;
  const posterUrl = getTMDBImageUrl(posterPath, 'w185');
  const theaterName = ticket.theaterName || 'Unknown Theater';

  const dateTimeStr = formatDateTime(ticket.date, ticket.showtime);
  const seatStr = formatSeat(ticket.seatRow, ticket.seatNumber);
  const priceStr = formatPrice(ticket.priceAmount, ticket.priceCurrency);

  // Determine action button text and handler
  let actionText = 'Edit';
  let actionHandler = onEdit;
  let actionStyle: StyleProp<ViewStyle> = styles.editButton;

  if (status === 'review') {
    actionText = 'Review';
  } else if (status === 'error') {
    actionText = 'Manual Search';
    actionHandler = onSearchTMDB || onEdit;
    actionStyle = [styles.editButton, styles.editButtonError];
  }

  // Gradient colors for status background
  const gradientColors = [
    `${statusColor}0D`, // 5% opacity (0.05 * 255 = ~13 = 0D)
    Colors.dark.card,
  ];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.cardContainer,
        pressed && styles.cardPressed,
      ]}
      onPress={onEdit}
    >
      {/* Status border indicator */}
      <View style={[styles.statusBorder, { backgroundColor: statusColor }]} />

      {/* Gradient background */}
      <LinearGradient
        colors={gradientColors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 0 }}
        style={styles.gradientBackground}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Poster thumbnail */}
        <View style={styles.posterContainer}>
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <FilmPlaceholderIcon />
            </View>
          )}
        </View>

        {/* Info section */}
        <View style={styles.infoSection}>
          {/* Title row with status icon */}
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                status === 'error' && styles.titleError,
              ]}
              numberOfLines={1}
            >
              {movieTitle}
            </Text>
            {status === 'match' && <CheckIcon />}
            {status === 'review' && <WarningIcon />}
            {status === 'error' && <ErrorIcon />}
          </View>

          {/* Theater name */}
          <Text style={styles.theater} numberOfLines={1}>
            {status === 'error' ? 'Parsing failed' : theaterName}
          </Text>

          {/* Review hint for low confidence matches */}
          {status === 'review' && (
            <Text style={styles.reviewHint}>Tap to confirm match</Text>
          )}

          {/* Error explanation */}
          {status === 'error' && (
            <Text style={styles.errorHint}>
              Could not identify movie from ticket text.
            </Text>
          )}

          {/* Detail chips */}
          <View style={styles.chipRow}>
            {dateTimeStr ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{dateTimeStr}</Text>
              </View>
            ) : null}
            {seatStr ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{seatStr}</Text>
              </View>
            ) : status !== 'error' ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Seat ??</Text>
              </View>
            ) : null}
            {ticket.format ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{ticket.format}</Text>
              </View>
            ) : null}
          </View>

          {/* Bottom row: price, rating + action button */}
          <View style={styles.bottomRow}>
            <View style={styles.priceRatingRow}>
              <Text style={styles.price}>
                {priceStr || (status !== 'error' ? '--' : '')}
              </Text>
              {ticket.mpaaRating ? (
                <Text style={styles.rating}>{ticket.mpaaRating}</Text>
              ) : null}
            </View>
            <Pressable
              style={({ pressed }) => [
                actionStyle,
                pressed && styles.editButtonPressed,
              ]}
              onPress={(e) => {
                e.stopPropagation();
                actionHandler();
              }}
            >
              <Text
                style={[
                  styles.editButtonText,
                  status === 'error' && styles.editButtonTextError,
                ]}
              >
                {actionText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  statusBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 10,
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  content: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    zIndex: 1,
  },

  // Poster styles
  posterContainer: {
    width: 60,
    height: 90,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  posterPlaceholder: {
    width: 60,
    height: 90,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmIconText: {
    fontSize: 24,
    opacity: 0.5,
  },

  // Info section styles
  infoSection: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    ...Typography.body.baseMedium,
    color: Colors.dark.text,
    flex: 1,
  },
  titleError: {
    color: Colors.dark.textSecondary,
  },
  statusIcon: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconText: {
    fontSize: 14,
    fontWeight: '700',
  },

  theater: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
  },
  reviewHint: {
    ...Typography.body.xs,
    color: Colors.dark.textTertiary,
    textDecorationLine: 'underline',
    marginBottom: 2,
  },
  errorHint: {
    ...Typography.body.xs,
    color: Colors.dark.textTertiary,
    marginTop: Spacing.xs,
  },

  // Chip styles
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  chip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: 6,
  },
  chipText: {
    ...Typography.body.xs,
    color: Colors.dark.textSecondary,
  },

  // Bottom row styles
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 'auto',
  },
  priceRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  price: {
    ...Typography.body.sm,
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  rating: {
    ...Typography.body.sm,
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editButtonError: {
    // Additional styles for error state if needed
  },
  editButtonPressed: {
    opacity: 0.7,
  },
  editButtonText: {
    ...Typography.body.sm,
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  editButtonTextError: {
    color: '#ef4444', // Error red
  },
});

export default TicketReviewCard;
