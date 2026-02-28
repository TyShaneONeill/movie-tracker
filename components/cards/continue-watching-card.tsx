import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface ContinueWatchingCardProps {
  showId: number;
  name: string;
  posterPath: string | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  episodesWatched: number | null;
  totalEpisodes: number | null;
  onPress: () => void;
}

type ThemeColors = typeof Colors.dark;

const CARD_WIDTH = 130;
const POSTER_HEIGHT = 195;

export function ContinueWatchingCard({
  name,
  posterPath,
  currentSeason,
  currentEpisode,
  episodesWatched,
  totalEpisodes,
  onPress,
}: ContinueWatchingCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  const progressText =
    currentSeason != null && currentEpisode != null
      ? `S${currentSeason} E${currentEpisode}`
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
        <Text style={dynamicStyles.progress}>{progressText}</Text>
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
    progress: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      marginTop: 2,
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
