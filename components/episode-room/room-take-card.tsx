/**
 * RoomTakeCard — one take inside an Episode Room.
 *
 * Reuses the First Takes v2 stub language verbatim (TornStub silhouette,
 * RatingStamp ink stamp, SpoilerRedaction, hairline Chip) with the mock's one
 * intentional adaptation: because every take in a room already shares one
 * episode, the movie-identity footer becomes an author-identity footer
 * (avatar + handle). The S·E / TV chips are dropped for the same reason — they
 * would just repeat the room header.
 *
 * The most popular take renders as the torn-stub hero with an accent (rose)
 * stamp; the rest fall to quiet ledger rows. The card is a single tap target
 * that opens the take's detail page — deep comment threads deliberately live
 * there, not inline in the room (Ty, 2026-07-19). The 💬 count in the footer
 * is the affordance hint.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { formatRelativeTime } from '@/lib/utils';
import { hasRating } from '@/lib/first-takes-v2-logic';
import { TornStub } from '@/components/first-takes-v2/torn-stub';
import { RatingStamp } from '@/components/first-takes-v2/rating-stamp';
import { SpoilerRedaction } from '@/components/first-takes-v2/spoiler-redaction';
import { Chip } from '@/components/first-takes-v2/chip';
import { Avatar } from '@/components/ui/avatar';
import type { EpisodeRoomTake } from '@/hooks/use-episode-room';

interface RoomTakeCardProps {
  entry: EpisodeRoomTake;
  /** The most popular take gets the torn-stub hero treatment; the rest are ledger rows. */
  variant: 'hero' | 'ledger';
  /** Opens the take's detail page (full comment thread lives there). */
  onPress?: () => void;
}

function authorHandle(entry: EpisodeRoomTake): string {
  const { author } = entry;
  if (author?.username) return `@${author.username.toUpperCase()}`;
  if (author?.fullName) return author.fullName.toUpperCase();
  return 'SOMEONE';
}

function TakeFooter({ entry }: { entry: EpisodeRoomTake }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { take, author } = entry;
  const likeCount = take.like_count ?? 0;
  const commentCount = take.comment_count ?? 0;

  return (
    <View style={styles.footer}>
      <Avatar
        size={20}
        userId={author?.id}
        name={author?.fullName ?? author?.username}
        avatarUrl={author?.avatarUrl}
        updatedAt={author?.updatedAt}
      />
      <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
        {authorHandle(entry)}
      </Text>
      {take.is_rewatch && <Chip label="Rewatch" color={colors.tint} border={colors.tint} />}
      {take.edited_at && (
        <Chip label="Edited" color={colors.textSecondary} border={colors.border} />
      )}
      <Text style={[styles.time, { color: colors.textTertiary }]}>
        {formatRelativeTime(take.created_at ?? '')}
      </Text>
      <View style={styles.counts}>
        {likeCount > 0 && (
          <View style={styles.count}>
            <Ionicons name="heart-outline" size={12} color={colors.textTertiary} />
            <Text style={[styles.countText, { color: colors.textTertiary }]}>{likeCount}</Text>
          </View>
        )}
        <View style={styles.count}>
          <Ionicons name="chatbubble-outline" size={12} color={colors.textTertiary} />
          {commentCount > 0 && (
            <Text style={[styles.countText, { color: colors.textTertiary }]}>{commentCount}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function RoomTakeCard({ entry, variant, onPress }: RoomTakeCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { take } = entry;
  const isHero = variant === 'hero';

  const heroQuote = (
    <View>
      <Text style={[styles.quoteMark, { color: colors.tint }]}>&ldquo;</Text>
      <Text style={[styles.heroQuote, { color: colors.text }]}>{take.quote_text}</Text>
    </View>
  );

  const ledgerQuote = (
    <Text style={[styles.ledgerQuote, { color: colors.text }]} numberOfLines={3}>
      <Text style={{ color: colors.textTertiary }}>&ldquo;</Text>
      {take.quote_text}
      <Text style={{ color: colors.textTertiary }}>&rdquo;</Text>
    </Text>
  );

  const quote = isHero ? heroQuote : ledgerQuote;

  const body = (
    <>
      <View style={styles.topRow}>
        <View style={styles.quoteWrap}>
          {take.is_spoiler ? <SpoilerRedaction>{quote}</SpoilerRedaction> : quote}
        </View>
        {hasRating(take) && (
          <RatingStamp rating={take.rating!} accent={isHero} size={isHero ? 52 : 40} />
        )}
      </View>
      <TakeFooter entry={entry} />
    </>
  );

  const card = isHero ? (
    <TornStub>{body}</TornStub>
  ) : (
    <View style={styles.ledgerRow}>{body}</View>
  );

  if (!onPress) return card;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${authorHandle(entry)}'s take`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ledgerRow: {
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  quoteWrap: {
    flex: 1,
  },
  quoteMark: {
    fontSize: 40,
    lineHeight: 34,
    fontWeight: '700',
    marginBottom: 2,
  },
  heroQuote: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  ledgerQuote: {
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },
  handle: {
    fontSize: 10,
    letterSpacing: 0.7,
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
    gap: 10,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  countText: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
