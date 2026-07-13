/**
 * Watching detail — the merged movies + TV "now playing" list (contract B/E).
 * Scope chips (All / Movies / TV) appear only when both media exist; TV rows
 * show "Next · SxEy" + a thin progress bar from continue-watching data. Empty
 * state is the projector-idle invitation, not a wrong-medium void.
 */

import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { Chip } from '@/components/first-takes-v2/chip';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { FirstTakesScopeChips } from '@/components/first-takes-v2/scope-chips';
import {
  watchingScopeCounts,
  shouldShowWatchingScopes,
  filterWatchingByScope,
  nextEpisodeLabel,
  episodeProgress,
  type WatchingItem,
  type WatchingScope,
} from '@/lib/lists-v2-logic';

interface WatchingRowsProps {
  items: WatchingItem[];
  onPressItem: (item: WatchingItem) => void;
  onFindSomething: () => void;
}

export function WatchingRows({ items, onPressItem, onFindSomething }: WatchingRowsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [scope, setScope] = useState<WatchingScope>('all');

  const counts = useMemo(() => watchingScopeCounts(items), [items]);
  const showScope = shouldShowWatchingScopes(items);
  const visible = useMemo(() => filterWatchingByScope(items, scope), [items, scope]);

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf' }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>The projector is idle</Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
          Mark a film or show as Watching and it lands here, progress and all.
        </Text>
        <Pressable
          onPress={onFindSomething}
          accessibilityRole="button"
          accessibilityLabel="Find something to watch"
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.ctaText}>Find something to watch</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {showScope && (
        <View style={styles.scopeRow}>
          <FirstTakesScopeChips active={scope} counts={counts} onChange={setScope} noun="watching" />
        </View>
      )}

      {visible.map((item, index) => {
        const posterUrl = getTMDBImageUrl(item.posterPath, 'w185');
        const isTv = item.media === 'tv';
        const nextLabel = isTv ? nextEpisodeLabel(item) : null;
        const progress = isTv ? episodeProgress(item) : 0;
        return (
          <View key={item.key}>
            {index > 0 && <Perforation />}
            <Pressable
              onPress={() => onPressItem(item)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Image
                source={{ uri: posterUrl ?? undefined }}
                style={[styles.poster, { backgroundColor: colors.card }]}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.rowBody}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  {isTv ? (
                    <>
                      <Chip label="TV" color={colors.textSecondary} border={colors.border} />
                      {nextLabel && (
                        <Text style={[styles.meta, { color: colors.textTertiary }]}>{nextLabel}</Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.meta, { color: colors.textTertiary }]}>Film</Text>
                  )}
                </View>
                {isTv && progress > 0 && (
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[styles.progressFill, { backgroundColor: colors.tint, width: `${progress * 100}%` }]}
                    />
                  </View>
                )}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  scopeRow: {
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  poster: {
    width: 52,
    height: 78,
    borderRadius: 6,
  },
  rowBody: {
    flex: 1,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  meta: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 26,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 16,
  },
  cta: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
