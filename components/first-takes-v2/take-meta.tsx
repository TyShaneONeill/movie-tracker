/**
 * TakeMeta — the fine-print footer of a stub back (contract note A/D).
 *
 * The movie identity, demoted: a 24×36 w92 poster thumb, uppercase title,
 * relative time, real-state chips, and like/comment counts drawn with the app's
 * Ionicons outline vectors (never emoji glyphs). Uppercase, letter-spaced,
 * tabular — the printed matter on the back of the ticket.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';
import type { FirstTake } from '@/lib/database.types';
import { takeDisplayTitle } from '@/lib/first-takes-v2-logic';
import { TakeChips } from './take-chips';

interface TakeMetaProps {
  take: FirstTake;
  /** Hero footer sits above a dashed rule; ledger rows have no top rule. */
  divider?: boolean;
}

export function TakeMeta({ take, divider = false }: TakeMetaProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const posterUri = take.poster_path
    ? getTMDBImageUrl(take.poster_path, 'w92') ?? undefined
    : undefined;
  const likeCount = take.like_count ?? 0;
  const commentCount = take.comment_count ?? 0;

  return (
    <View
      style={[
        styles.row,
        divider && { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
      ]}
    >
      <Image
        source={{ uri: posterUri }}
        style={[styles.thumb, { backgroundColor: colors.border }]}
        contentFit="cover"
        transition={200}
        accessibilityIgnoresInvertColors
      />
      <Text
        style={[styles.title, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {takeDisplayTitle(take)}
      </Text>
      <TakeChips take={take} />
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
        {commentCount > 0 && (
          <View style={styles.count}>
            <Ionicons name="chatbubble-outline" size={12} color={colors.textTertiary} />
            <Text style={[styles.countText, { color: colors.textTertiary }]}>{commentCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
