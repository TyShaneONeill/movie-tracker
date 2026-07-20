import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useNextEpisodeUp } from '@/hooks/use-next-episode-up';

interface ContinueWatchingCardProps {
  showId: number;
  name: string;
  posterPath: string | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  episodesWatched: number | null;
  totalEpisodes: number | null;
  onPress: () => void;
  /**
   * Opens the Episode Room for the given (season, episode) — the resolved
   * NEXT-UP episode, or the last-watched one when next-up can't be computed.
   * When absent (flag off, or no current episode) the card renders exactly as
   * before — the bubble is the only addition, sharing the progress row so
   * nothing shifts.
   */
  onRoomPress?: (season: number, episode: number) => void;
}

type ThemeColors = typeof Colors.dark;

const CARD_WIDTH = 130;
const POSTER_HEIGHT = 195;

export function ContinueWatchingCard({
  showId,
  name,
  posterPath,
  currentSeason,
  currentEpisode,
  episodesWatched,
  totalEpisodes,
  onPress,
  onRoomPress,
}: ContinueWatchingCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Next-up correctness: after finishing S4E14 the card should read "S5 E1", not
  // the last-watched coordinate. Falls back to last-watched while the catalog
  // loads or when caught up (never blank). Computed for everyone — the display
  // fix isn't flag-gated; only the room bubble (onRoomPress) is.
  const nextUp = useNextEpisodeUp(showId, currentSeason, currentEpisode);
  const roomSeason = nextUp?.season ?? currentSeason;
  const roomEpisode = nextUp?.episode ?? currentEpisode;

  const progressText =
    roomSeason != null && roomEpisode != null
      ? `S${roomSeason} E${roomEpisode}`
      : episodesWatched != null && totalEpisodes != null
        ? `${episodesWatched}/${totalEpisodes} episodes`
        : null;

  const progressRatio =
    episodesWatched != null && totalEpisodes != null && totalEpisodes > 0
      ? episodesWatched / totalEpisodes
      : 0;

  const posterUrl = posterPath
    ? `https://image.tmdb.org/t/p/w185${posterPath}`
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        dynamicStyles.container,
        { transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}
    >
      <View style={[dynamicStyles.posterContainer, Shadows.sm]}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={dynamicStyles.poster}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[dynamicStyles.poster, dynamicStyles.posterPlaceholder]}>
            <Text style={dynamicStyles.placeholderText}>No Image</Text>
          </View>
        )}
      </View>
      <Text style={dynamicStyles.name} numberOfLines={1}>
        {name}
      </Text>
      {progressText && (
        <View style={dynamicStyles.progressRow}>
          <Text style={dynamicStyles.progress}>{progressText}</Text>
          {onRoomPress && roomSeason != null && roomEpisode != null && (
            <Pressable
              onPress={() => onRoomPress(roomSeason, roomEpisode)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Open the Episode Room for ${progressText}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              {/* Same icon as the show screen's episode rows — one affordance,
                  learned once. */}
              <Ionicons name="chatbubbles-outline" size={14} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      )}
      {progressRatio > 0 && (
        <View style={dynamicStyles.progressBarContainer}>
          <View
            style={[
              dynamicStyles.progressBarFill,
              { width: `${Math.min(progressRatio * 100, 100)}%` },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: CARD_WIDTH,
    },
    posterContainer: {
      width: CARD_WIDTH,
      height: POSTER_HEIGHT,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    poster: {
      width: '100%',
      height: '100%',
    },
    posterPlaceholder: {
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholderText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    name: {
      ...Typography.body.sm,
      color: colors.text,
      marginTop: Spacing.xs,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    progress: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
    progressBarContainer: {
      height: 3,
      backgroundColor: colors.border,
      borderRadius: 2,
      marginTop: Spacing.xs,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.tint,
      borderRadius: 2,
    },
  });
