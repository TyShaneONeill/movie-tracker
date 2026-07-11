/**
 * ResultRow — a single unified search result (Proposal 01.2).
 *
 * Movie/TV: 44×62 rounded poster, title, meta line, StubBadge on the right.
 * Person: 44px avatar circle (photo or initials) + known-for meta line.
 *
 * `highlighted` flows into the StubBadge — used for rescue rows (the non-default
 * type in the active scope's context).
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { StubBadge } from './stub-badge';
import type { UnifiedResult, MediaScope } from '@/lib/search-v2-logic';

interface ResultRowProps {
  result: UnifiedResult;
  onPress: (result: UnifiedResult) => void;
  highlighted?: boolean;
  isFirst?: boolean;
}

const BADGE_LABEL: Record<MediaScope, string> = {
  movie: 'Movie',
  tv: 'TV',
  person: 'Person',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ResultRow({ result, onPress, highlighted = false, isFirst = false }: ResultRowProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const isPerson = result.scope === 'person';
  const imageUrl = getTMDBImageUrl(result.posterPath, 'w154');

  return (
    <Pressable
      onPress={() => onPress(result)}
      accessibilityRole="button"
      accessibilityLabel={`${result.title}, ${BADGE_LABEL[result.scope]}`}
      style={({ pressed }) => [
        styles.row,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {isPerson ? (
        imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.avatar, { backgroundColor: colors.card }]}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.card }]}>
            <Text style={[styles.initials, { color: colors.textSecondary }]}>
              {initials(result.title)}
            </Text>
          </View>
        )
      ) : (
        <Image
          source={{ uri: imageUrl ?? undefined }}
          style={[styles.poster, { backgroundColor: colors.card, borderColor: colors.border }]}
          contentFit="cover"
          transition={150}
        />
      )}

      <View style={styles.main}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {result.title}
        </Text>
        {!!result.meta && (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {result.meta}
          </Text>
        )}
      </View>

      <StubBadge label={BADGE_LABEL[result.scope]} highlighted={highlighted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  poster: {
    width: 44,
    height: 62,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 15,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  meta: {
    fontSize: 12.5,
    marginTop: 2,
  },
});
