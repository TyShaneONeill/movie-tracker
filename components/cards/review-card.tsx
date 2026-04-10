import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';
import { LikeButton } from '@/components/like-button';
import { LikedByIndicator } from '@/components/liked-by-indicator';

export interface ReviewCardProps {
  id: string;
  movieTitle: string;
  posterPath: string | null;
  title: string;
  reviewText: string;
  rating: number;
  isSpoiler: boolean;
  isRewatch: boolean;
  visibility?: string;
  createdAt: string;
  likeCount?: number;
  isLiked?: boolean;
  onPress: () => void;
  onDelete?: () => void;
  style?: ViewStyle;
}

function formatRating(rating: number): string {
  return Number.isInteger(rating) ? rating.toString() : rating.toFixed(1);
}

function getRatingColor(rating: number, tintColor: string): string {
  if (rating >= 8) return '#22C55E';
  if (rating >= 6) return '#EAB308';
  return tintColor;
}

function getVisibilityIcon(visibility?: string): string {
  if (visibility === 'followers_only') return 'people-outline';
  if (visibility === 'private') return 'lock-closed-outline';
  return 'globe-outline';
}

export function ReviewCard({
  id,
  movieTitle,
  posterPath,
  title,
  reviewText,
  rating,
  isSpoiler,
  isRewatch,
  visibility,
  createdAt,
  likeCount,
  isLiked,
  onPress,
  onDelete,
  style,
}: ReviewCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const handlePress = () => {
    hapticImpact();
    onPress();
  };

  const handleLongPress = () => {
    if (!onDelete) return;

    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on RN Web — use the browser's native confirm dialog
      if (window.confirm('Delete this review? This cannot be undone.')) {
        onDelete();
      }
      return;
    }

    hapticNotification(NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Review',
      'This will permanently delete your review. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete() },
      ]
    );
  };

  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  const truncatedText =
    reviewText.length > 100 ? reviewText.slice(0, 100) + '...' : reviewText;

  const showContent = !isSpoiler || spoilerRevealed;

  const cardContent = (
    <Pressable
      style={[styles.card, style]}
      onPress={handlePress}
      onLongPress={onDelete ? handleLongPress : undefined}
      delayLongPress={400}
    >
      <View style={styles.header}>
        <Image
          source={{ uri: getTMDBImageUrl(posterPath, 'w92') ?? undefined }}
          style={styles.poster}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.titleContainer}>
          <Text style={styles.movieTitle} numberOfLines={1}>
            {movieTitle}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.time}>{formatRelativeTime(createdAt)}</Text>
            <Ionicons name={getVisibilityIcon(visibility) as any} size={12} color={colors.textTertiary} />
          </View>
        </View>
        <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(rating, colors.tint) }]}>
          <Text style={styles.ratingText}>{formatRating(rating)}</Text>
        </View>
        {Platform.OS === 'web' && onDelete && (
          <Pressable
            onPress={(e: any) => { e.stopPropagation?.(); handleLongPress(); }}
            style={styles.webTrashButton}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {showContent ? (
        <>
          <Text style={styles.reviewTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.reviewText} numberOfLines={3}>
            {truncatedText}
          </Text>
        </>
      ) : (
        <Pressable
          style={styles.spoilerOverlay}
          onPress={(e) => {
            e.stopPropagation?.();
            setSpoilerRevealed(true);
          }}
        >
          <Ionicons name="eye-off-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.spoilerText}>Contains Spoilers — Tap to reveal</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm }}>
        <LikeButton
          targetType="review"
          targetId={id}
          initialLiked={isLiked}
          initialLikeCount={likeCount}
          size="sm"
        />
      </View>
      {likeCount != null && likeCount > 0 && (
        <LikedByIndicator
          targetType="review"
          targetId={id}
          likeCount={likeCount}
        />
      )}

      {isRewatch && (
        <View style={styles.pillsRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Rewatch</Text>
          </View>
        </View>
      )}
    </Pressable>
  );

  return cardContent;
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    poster: {
      width: 30,
      height: 45,
      borderRadius: 4,
    },
    titleContainer: {
      flex: 1,
      marginLeft: Spacing.sm,
      marginRight: Spacing.sm,
    },
    movieTitle: {
      ...Typography.body.base,
      fontWeight: '600',
      color: colors.text,
    },
    time: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    ratingBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ratingText: {
      ...Typography.body.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    reviewTitle: {
      ...Typography.body.base,
      fontWeight: '600',
      color: colors.text,
      marginBottom: Spacing.xs,
    },
    reviewText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    spoilerOverlay: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: Spacing.xs,
      opacity: 0.9,
    },
    spoilerText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      fontStyle: 'italic',
    },
    pillsRow: {
      flexDirection: 'row',
      marginTop: Spacing.sm,
      gap: Spacing.xs,
    },
    pill: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    pillText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
    webTrashButton: {
      padding: 4,
      marginLeft: Spacing.xs,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
