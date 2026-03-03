/**
 * ReleaseCard Component
 * Horizontal card showing a movie release with poster, title, genre pills,
 * rating, and a watchlist toggle button.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTMDBImageUrl, TMDB_GENRE_MAP } from '@/lib/tmdb.types';
import type { CalendarRelease } from '@/lib/tmdb.types';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface ReleaseCardProps {
  release: CalendarRelease;
  isOnWatchlist?: boolean;
  tasteLabel?: string | null;
  onPress: (tmdbId: number) => void;
  onToggleWatchlist?: (tmdbId: number) => void;
}

export function ReleaseCard({
  release,
  isOnWatchlist = false,
  tasteLabel,
  onPress,
  onToggleWatchlist,
}: ReleaseCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const posterUrl = getTMDBImageUrl(release.poster_path, 'w185');

  const genreLabels = useMemo(() => {
    return release.genre_ids
      .slice(0, 2)
      .map((id) => TMDB_GENRE_MAP[id])
      .filter(Boolean);
  }, [release.genre_ids]);

  const ratingDisplay = release.vote_average > 0
    ? release.vote_average.toFixed(1)
    : null;

  return (
    <Pressable
      onPress={() => onPress(release.tmdb_id)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Poster */}
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={[styles.poster, { backgroundColor: colors.backgroundSecondary }]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={[
            styles.poster,
            {
              backgroundColor: colors.backgroundSecondary,
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}
        >
          <Ionicons name="film-outline" size={24} color={colors.textTertiary} />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Title */}
        <Text
          style={[
            Typography.body.smMedium,
            { color: colors.text, fontSize: 15, fontWeight: '700' },
          ]}
          numberOfLines={2}
        >
          {release.title}
        </Text>

        {/* Genre Pills */}
        {genreLabels.length > 0 && (
          <View style={styles.genreRow}>
            {genreLabels.map((genre) => (
              <View
                key={genre}
                style={[
                  styles.genrePill,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
              >
                <Text
                  style={[
                    styles.genreText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {genre}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Rating */}
        {ratingDisplay && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={colors.textSecondary} />
            <Text
              style={[
                styles.ratingText,
                { color: colors.textSecondary },
              ]}
            >
              {ratingDisplay}
            </Text>
          </View>
        )}

        {/* Taste Match Indicator */}
        {tasteLabel && !isOnWatchlist && (
          <View style={styles.tasteRow}>
            <Ionicons name="sparkles" size={12} color={colors.tint} />
            <Text style={[styles.tasteText, { color: colors.tint }]}>
              {tasteLabel}
            </Text>
          </View>
        )}

        {/* Watchlist Button */}
        {onToggleWatchlist && (
          <Pressable
            onPress={() => onToggleWatchlist(release.tmdb_id)}
            hitSlop={8}
            style={[
              styles.watchlistButton,
              isOnWatchlist
                ? { backgroundColor: colors.tint }
                : {
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderColor: colors.textSecondary,
                  },
            ]}
          >
            <Ionicons
              name={isOnWatchlist ? 'checkmark' : 'add'}
              size={16}
              color={isOnWatchlist ? '#fff' : colors.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  genreRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  genrePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  genreText: {
    fontSize: 11,
    lineHeight: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    lineHeight: 16,
  },
  tasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tasteText: {
    fontSize: 12,
    fontWeight: '600',
  },
  watchlistButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ReleaseCard;
