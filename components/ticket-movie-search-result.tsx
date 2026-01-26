/**
 * Ticket Movie Search Result Component
 *
 * A compact movie result component for the ticket edit modal.
 * Shows small poster, title, and year in a pressable row.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl, type TMDBMovie } from '@/lib/tmdb.types';

// ============================================================================
// Types
// ============================================================================

export interface TicketMovieSearchResultProps {
  movie: TMDBMovie;
  onSelect: (movie: TMDBMovie) => void;
}

// ============================================================================
// Component
// ============================================================================

export function TicketMovieSearchResult({
  movie,
  onSelect,
}: TicketMovieSearchResultProps) {
  const posterUrl = getTMDBImageUrl(movie.poster_path, 'w92');
  const releaseYear = movie.release_date
    ? new Date(movie.release_date).getFullYear()
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
      onPress={() => onSelect(movie)}
    >
      {/* Poster */}
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={styles.poster} />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]}>
          <Text style={styles.posterPlaceholderText}>?</Text>
        </View>
      )}

      {/* Title and Year */}
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {movie.title}
        </Text>
        {releaseYear && (
          <Text style={styles.year}>{releaseYear}</Text>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  containerPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  poster: {
    width: 40,
    height: 60,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  posterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderText: {
    color: Colors.dark.textTertiary,
    fontSize: 18,
    fontWeight: '600',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...Typography.body.base,
    color: Colors.dark.text,
    fontWeight: '500',
  },
  year: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
});

export default TicketMovieSearchResult;
