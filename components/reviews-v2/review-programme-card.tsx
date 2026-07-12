/**
 * ReviewProgrammeCard — a single review rendered as a "programme note"
 * (contract note D). Headline keeps top billing (16.5/700); the body clamps at
 * three lines; the rating is the neutral ink stamp (shared with First Takes,
 * quiet variant — no green/yellow/rose); the footer is the fine-print ledger
 * line (thumb, caps title, chips, time, ♥).
 *
 * All legacy interactions are preserved: tap → detail, long-press (native) /
 * trash (web) delete on the owner's profile, the interactive like button + its
 * count, and the "liked by" indicator. A spoiler redacts the BODY in place
 * (headline stays visible, per Decision 1); reveal is local and remounts with
 * the card key so a new review at the same slot starts redacted (the #662
 * key-by-id lesson).
 */

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';
import type { Review } from '@/lib/database.types';
import { LikeButton } from '@/components/like-button';
import { LikedByIndicator } from '@/components/liked-by-indicator';
import { RatingStamp } from '@/components/first-takes-v2/rating-stamp';
import { SpoilerRedaction } from '@/components/first-takes-v2/spoiler-redaction';
import { ReviewChips } from './review-chips';

interface ReviewProgrammeCardProps {
  review: Review;
  onPress: () => void;
  /** Owner's profile only — enables long-press (native) / trash (web) delete. */
  onDelete?: () => void;
}

export function ReviewProgrammeCard({ review, onPress, onDelete }: ReviewProgrammeCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    hapticImpact();
    onPress();
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on RN Web — use the browser's confirm dialog.
      if (window.confirm('Delete this review? This cannot be undone.')) onDelete();
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

  const posterUri = getTMDBImageUrl(review.poster_path, 'w92') ?? undefined;
  const likeCount = review.like_count ?? 0;

  const body = (
    <Text style={styles.body} numberOfLines={3}>
      {review.review_text}
    </Text>
  );
  // One consistent top gap under the headline whether the body shows or the
  // redaction chip stands in its place.
  const bodySlot = (
    <View style={styles.bodySlot}>
      {review.is_spoiler ? <SpoilerRedaction>{body}</SpoilerRedaction> : body}
    </View>
  );

  return (
    <Pressable
      style={styles.card}
      onPress={handlePress}
      onLongPress={onDelete ? handleDelete : undefined}
      delayLongPress={400}
    >
      <View style={styles.top}>
        <View style={styles.textCol}>
          <Text style={[styles.headline, { color: colors.text }]} numberOfLines={2}>
            {review.title}
          </Text>
          {bodySlot}
        </View>
        <View style={styles.stamp}>
          <RatingStamp rating={review.rating} size={40} />
        </View>
      </View>

      <View style={styles.fineprint}>
        <Image
          source={{ uri: posterUri }}
          style={[styles.thumb, { backgroundColor: colors.border }]}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
        />
        <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>
          {review.movie_title}
        </Text>
        <ReviewChips review={review} />
        <Text style={[styles.time, { color: colors.textTertiary }]}>
          {formatRelativeTime(review.created_at)}
        </Text>

        <View style={styles.counts}>
          <LikeButton
            targetType="review"
            targetId={review.id}
            initialLikeCount={review.like_count ?? undefined}
            size="sm"
          />
          {Platform.OS === 'web' && onDelete && (
            <Pressable
              onPress={(e: any) => {
                e.stopPropagation?.();
                handleDelete();
              }}
              hitSlop={8}
              style={styles.webTrash}
              accessibilityRole="button"
              accessibilityLabel="Delete review"
            >
              <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {likeCount > 0 && (
        <LikedByIndicator targetType="review" targetId={review.id} likeCount={likeCount} />
      )}
    </Pressable>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      paddingTop: 16,
      paddingBottom: 14,
      paddingHorizontal: 4,
    },
    top: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    textCol: {
      flex: 1,
    },
    headline: {
      fontSize: 16.5,
      fontWeight: '700',
      letterSpacing: -0.15,
      lineHeight: 21,
    },
    bodySlot: {
      marginTop: 6,
    },
    body: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
    },
    stamp: {
      marginTop: 2,
    },
    fineprint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      flexWrap: 'wrap',
    },
    thumb: {
      width: 24,
      height: 36,
      borderRadius: 3,
    },
    title: {
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontWeight: '700',
      flexShrink: 1,
    },
    time: {
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontVariant: ['tabular-nums'],
    },
    counts: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    webTrash: {
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
