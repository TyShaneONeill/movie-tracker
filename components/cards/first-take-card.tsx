/**
 * FirstTakeCard Component
 * iMessage-style card for displaying movie first takes/reactions
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';

interface FirstTakeCardProps {
  /**
   * Movie title
   */
  movieTitle: string;

  /**
   * Movie poster path (TMDB path, not full URL)
   */
  posterPath: string | null;

  /**
   * Reaction emoji
   */
  emoji: string;

  /**
   * Quote/reaction text
   */
  quote: string;

  /**
   * ISO date string when the take was created
   */
  createdAt: string;

  /**
   * Whether this is the latest (most recent) take
   * Shows gold left border when true
   */
  isLatest?: boolean;

  /**
   * Callback when card is pressed
   */
  onPress: () => void;

  /**
   * Additional style overrides
   */
  style?: ViewStyle;
}

export function FirstTakeCard({
  movieTitle,
  posterPath,
  emoji,
  quote,
  createdAt,
  isLatest = false,
  onPress,
  style,
}: FirstTakeCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderLeftColor: isLatest ? colors.gold : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      {/* Header: Poster + Title/Time + Emoji */}
      <View style={styles.header}>
        <View style={styles.movieInfo}>
          <Image
            source={{
              uri: posterPath ? getTMDBImageUrl(posterPath, 'w92') ?? undefined : undefined,
            }}
            style={[styles.poster, { backgroundColor: colors.border }]}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.titleContainer}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={1}
            >
              {movieTitle}
            </Text>
            <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
              {formatRelativeTime(createdAt)}
            </Text>
          </View>
        </View>
        <Text style={[styles.emoji, { color: colors.tint }]}>{emoji}</Text>
      </View>

      {/* Quote */}
      <Text style={[styles.quote, { color: colors.text }]}>
        &ldquo;{quote}&rdquo;
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  movieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  poster: {
    width: 30,
    height: 45,
    borderRadius: 4,
  },
  titleContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  title: {
    ...Typography.body.base,
    fontWeight: '600',
  },
  timestamp: {
    ...Typography.body.xs,
    marginTop: 2,
  },
  emoji: {
    fontSize: 24,
    marginLeft: Spacing.sm,
  },
  quote: {
    ...Typography.body.base,
    fontStyle: 'italic',
    lineHeight: 22,
  },
});
