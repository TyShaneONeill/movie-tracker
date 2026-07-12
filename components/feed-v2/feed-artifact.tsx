/**
 * FeedArtifact — a friend's artifact rendered under its attribution ledger
 * (contract notes A + B). A first take is a compact stub-back mini (rose opening
 * quote, quote-first, neutral stamp); a review is a compact programme note
 * (headline + 2-line body + stamp). Both share the fine-print footer: 24×36
 * poster thumb, caps title, TV/Rewatch chips, and the interactive like button.
 *
 * REUSES the profile v2 system verbatim — RatingStamp, SpoilerRedaction, Chip,
 * LikeButton, Avatar — so type recognition (quote vs headline) happens before a
 * word is read and the whole app renders one artifact system.
 *
 * Spoiler bodies redact in place via SpoilerRedaction. The redaction's reveal is
 * local state, so it is keyed by the artifact id (the #662 lesson): a new
 * artifact at the same list slot remounts and starts redacted.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { analytics } from '@/lib/analytics';
import type { ActivityFeedItem } from '@/hooks/use-activity-feed';
import { RatingStamp } from '@/components/first-takes-v2/rating-stamp';
import { SpoilerRedaction } from '@/components/first-takes-v2/spoiler-redaction';
import { Chip } from '@/components/first-takes-v2/chip';
import { LikeButton } from '@/components/like-button';
import { Attribution } from './attribution';

interface FeedArtifactProps {
  item: ActivityFeedItem;
  timeLabel: string;
  /** True when the signed-in user authored this artifact — hides the "…" menu. */
  isOwn?: boolean;
  /** Opens the moderation (report) flow for a non-own artifact. */
  onReport?: () => void;
}

export function FeedArtifact({ item, timeLabel, isOwn = false, onReport }: FeedArtifactProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const isReview = item.activityType === 'review';
  const isTv = item.mediaType !== 'movie';
  const hasRating = item.rating != null && item.rating > 0;
  const posterUri = getTMDBImageUrl(item.posterPath, 'w92') ?? undefined;

  const openDetail = () => {
    analytics.track('feed:item_tap', {
      item_type: item.activityType,
      target: isReview ? 'review_text' : 'first_take',
      tmdb_id: item.tmdbId,
    });
    router.push(isReview ? `/review/${item.id}` : `/first-take/${item.id}`);
  };

  const openProfile = () => router.push(`/user/${item.userId}`);

  // The artifact body: quote (first take) or headline + clamped body (review).
  // A spoiler redacts the body in place; keyed by id so a new artifact at this
  // slot starts redacted.
  const body = isReview ? (
    <Text style={[styles.reviewBody, { color: colors.textSecondary }]} numberOfLines={2}>
      {item.quoteText}
    </Text>
  ) : (
    <Text style={[styles.quote, { color: colors.text }]}>
      <Text style={{ color: colors.tint, fontWeight: '700' }}>{'“'}</Text>
      {item.quoteText}
    </Text>
  );
  const bodySlot = item.isSpoiler ? (
    <SpoilerRedaction key={item.id}>{body}</SpoilerRedaction>
  ) : (
    body
  );

  return (
    <View>
      <Attribution
        userId={item.userId}
        name={item.userDisplayName ?? 'Anonymous'}
        avatarUrl={item.userAvatarUrl}
        verb={isReview ? 'wrote a review' : 'logged a first take'}
        timeLabel={timeLabel}
        onPressUser={openProfile}
        onMore={!isOwn && onReport ? onReport : undefined}
      />

      <Pressable
        onPress={openDetail}
        accessibilityRole="button"
        accessibilityLabel={`Open ${isReview ? 'review' : 'first take'} of ${item.movieTitle}`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.row2}>
          <View style={styles.bodyCol}>
            {isReview && item.reviewTitle ? (
              <Text style={[styles.headline, { color: colors.text }]} numberOfLines={2}>
                {item.reviewTitle}
              </Text>
            ) : null}
            {bodySlot}
          </View>
          {hasRating && (
            <View style={styles.stamp}>
              <RatingStamp rating={item.rating as number} size={38} />
            </View>
          )}
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
            {item.movieTitle}
          </Text>
          {isTv && <Chip label="TV" color={colors.textSecondary} border={colors.border} />}
          {item.isRewatch && <Chip label="Rewatch" color={colors.tint} border={colors.tint} />}
          <View style={styles.counts}>
            <LikeButton targetType={isReview ? 'review' : 'first_take'} targetId={item.id} size="sm" />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 2,
  },
  row2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  bodyCol: {
    flex: 1,
    minWidth: 0,
  },
  quote: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: '500',
  },
  headline: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 20,
    marginBottom: 4,
  },
  reviewBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  stamp: {
    marginTop: 0,
  },
  fineprint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
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
  counts: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
