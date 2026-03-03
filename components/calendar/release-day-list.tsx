/**
 * ReleaseDayList Component
 * Shows all releases for a selected day, grouped by release type
 * (Theatrical, Streaming, Digital/Physical).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarRelease } from '@/lib/tmdb.types';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { ReleaseCard } from './release-card';
import { ReleaseDayListSkeleton } from './calendar-skeleton';

interface ReleaseDayListProps {
  date: string; // YYYY-MM-DD
  releases: CalendarRelease[];
  watchlistIds: Set<number>;
  onMoviePress: (tmdbId: number) => void;
  onToggleWatchlist?: (tmdbId: number) => void;
  isLoading?: boolean;
}

/** Release type grouping configuration */
interface ReleaseGroup {
  key: string;
  label: string;
  emoji: string;
  types: number[];
  releases: CalendarRelease[];
}

const RELEASE_GROUPS: Omit<ReleaseGroup, 'releases'>[] = [
  { key: 'theatrical', label: 'THEATRICAL', emoji: '\uD83C\uDFAC', types: [1, 2, 3] },
  { key: 'streaming', label: 'STREAMING', emoji: '\uD83D\uDCFA', types: [6] },
  { key: 'digital_physical', label: 'DIGITAL / PHYSICAL', emoji: '\uD83D\uDCBF', types: [4, 5] },
];

/**
 * Format a YYYY-MM-DD date string into a readable header.
 * Returns e.g. "March 13 -- Today" or "March 15"
 */
function formatDateHeader(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
  const day = parseInt(dayStr, 10);

  const date = new Date(year, month, day);

  const monthName = date.toLocaleDateString('en-US', { month: 'long' });
  const label = `${monthName} ${day}`;

  // Check if this date is today
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(year, month, day);

  if (today.getTime() === target.getTime()) {
    return `${label} \u2014 Today`;
  }

  return label;
}

export function ReleaseDayList({
  date,
  releases,
  watchlistIds,
  onMoviePress,
  onToggleWatchlist,
  isLoading = false,
}: ReleaseDayListProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const groupedReleases = useMemo(() => {
    const groups: ReleaseGroup[] = RELEASE_GROUPS.map((g) => ({
      ...g,
      releases: [],
    }));

    for (const release of releases) {
      const group = groups.find((g) => g.types.includes(release.release_type));
      if (group) {
        group.releases.push(release);
      }
    }

    // Only return groups that have releases
    return groups.filter((g) => g.releases.length > 0);
  }, [releases]);

  const dateHeader = useMemo(() => formatDateHeader(date), [date]);

  // Loading state
  if (isLoading) {
    return (
      <ReleaseDayListSkeleton
        cardColor={colors.card}
        shimmerColor={colors.backgroundSecondary}
      />
    );
  }

  // Empty state
  if (releases.length === 0) {
    return (
      <View style={styles.wrapper}>
        <Text style={[styles.dateHeader, { color: colors.text }]}>
          {dateHeader}
        </Text>
        <View style={styles.emptyContainer}>
          <Ionicons
            name="calendar-outline"
            size={48}
            color={colors.textTertiary}
          />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            No releases on this date
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Check another day or adjust your filters
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Date Header */}
      <Text style={[styles.dateHeader, { color: colors.text }]}>
        {dateHeader}
      </Text>

      {/* Grouped Sections */}
      {groupedReleases.map((group) => (
        <View key={group.key} style={styles.section}>
          {/* Section Header */}
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
            {group.emoji} {group.label}
          </Text>

          {/* Release Cards */}
          {group.releases.map((release) => (
            <ReleaseCard
              key={`${release.tmdb_id}-${release.release_type}`}
              release={release}
              isOnWatchlist={watchlistIds.has(release.tmdb_id)}
              onPress={onMoviePress}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing.md,
  },
  dateHeader: {
    ...Typography.body.lg,
    fontWeight: '700',
    fontSize: 18,
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.body.baseMedium,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.body.sm,
    textAlign: 'center',
  },
});

export default ReleaseDayList;
