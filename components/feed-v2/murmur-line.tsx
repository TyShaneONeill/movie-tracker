/**
 * MurmurLine — a comment rendered as a quiet ledger line, not a card
 * (contract note C): "`name` commented on `owner`'s take — "quote"". Spoiler
 * comments show "Contains spoilers" exactly as the legacy feed does. Backs both
 * standalone comment feed items and the attached top-comment beneath an artifact
 * (Decision 4). Tapping opens the parent artifact's detail (the conversation).
 */

import { Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { analytics } from '@/lib/analytics';
import type { FeedMurmur } from '@/lib/feed-v2-logic';

interface MurmurLineProps {
  murmur: FeedMurmur;
}

export function MurmurLine({ murmur }: MurmurLineProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const open = () => {
    analytics.track('feed:item_tap', { item_type: 'comment', tmdb_id: murmur.tmdbId });
    if (murmur.targetId) {
      router.push(murmur.targetType === 'review' ? `/review/${murmur.targetId}` : `/first-take/${murmur.targetId}`);
    } else if (murmur.mediaType === 'tv_show') {
      router.push(`/tv/${murmur.tmdbId}`);
    } else {
      router.push(`/movie/${murmur.tmdbId}`);
    }
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Comment by ${murmur.commenterName} on ${murmur.ownerName}'s ${murmur.ownerType}`}
      style={({ pressed }) => [styles.line, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.text, { color: colors.textSecondary }]} numberOfLines={3}>
        <Text style={[styles.strong, { color: colors.text }]}>{murmur.commenterName}</Text>
        {' commented on '}
        <Text style={[styles.strong, { color: colors.text }]}>{murmur.ownerName}</Text>
        {`'s ${murmur.ownerType} — `}
        {murmur.isSpoiler ? (
          <Text style={[styles.spoiler, { color: colors.textTertiary }]}>Contains spoilers</Text>
        ) : (
          <Text style={{ color: colors.textSecondary }}>{`“${murmur.body}”`}</Text>
        )}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    marginTop: 14,
    marginHorizontal: 2,
  },
  text: {
    fontSize: 12.5,
    lineHeight: 19,
  },
  strong: {
    fontWeight: '600',
  },
  spoiler: {
    fontStyle: 'italic',
  },
});
