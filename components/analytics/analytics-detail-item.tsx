import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { AnalyticsDetailItem } from '@/lib/analytics-detail-service';

interface AnalyticsDetailItemProps {
  item: AnalyticsDetailItem;
  showTypeBadge: boolean;
  compact?: boolean;
}

export function AnalyticsDetailItemRow({ item, showTypeBadge, compact = false }: AnalyticsDetailItemProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const handlePress = () => {
    if (item.mediaType === 'tv') {
      router.push(`/tv/${item.tmdbId}`);
    } else {
      router.push(`/movie/${item.tmdbId}`);
    }
  };

  const imageUri = getTMDBImageUrl(item.posterPath, 'w185') ?? undefined;

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [styles.compactRow, { opacity: pressed ? 0.8 : 1 }]}
        onPress={handlePress}
      >
        <Image
          source={{ uri: imageUri }}
          style={[styles.compactPoster, { backgroundColor: colors.card }]}
          contentFit="cover"
          transition={200}
        />
        <Text
          style={[styles.compactTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.title}
          {item.year ? (
            <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
              {' '}({item.year})
            </Text>
          ) : null}
        </Text>
        <Text
          style={[Typography.body.sm, styles.compactDate, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.primaryMetric.replace(/^(Watched|Finished)\s/, '')}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={handlePress}
    >
      {/* Poster */}
      <Image
        source={{ uri: imageUri }}
        style={[styles.poster, { backgroundColor: colors.card }]}
        contentFit="cover"
        transition={200}
      />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {item.title}
            {item.year ? (
              <Text style={[styles.year, { color: colors.textSecondary }]}>
                {' '}({item.year})
              </Text>
            ) : null}
          </Text>
          {showTypeBadge && (
            <View style={[styles.badge, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {item.mediaType === 'tv' ? 'TV' : 'Movie'}
              </Text>
            </View>
          )}
        </View>

        <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}>
          {item.primaryMetric}
        </Text>

        {item.secondaryMetric != null && (
          <Text
            style={[
              Typography.body.sm,
              {
                color: item.secondaryMetric.startsWith('★')
                  ? colors.gold
                  : colors.textSecondary,
                marginTop: 2,
              },
            ]}
          >
            {item.secondaryMetric}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── Detailed (default) ──────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 6,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  title: {
    ...Typography.body.base,
    fontWeight: '600',
    flex: 1,
  },
  year: {
    fontWeight: '400',
  },
  badge: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Compact ─────────────────────────────────────────────────────────────────
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  compactPoster: {
    width: 32,
    height: 48,
    borderRadius: 4,
    flexShrink: 0,
  },
  compactTitle: {
    ...Typography.body.sm,
    fontWeight: '600',
    flex: 1,
  },
  compactDate: {
    flexShrink: 0,
    textAlign: 'right',
  },
});
