/**
 * Release Calendar Screen
 * Full-screen view showing monthly calendar with movie release dates.
 * Users can navigate months, select days, filter by release type,
 * and tap movies to view details.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import CalendarGrid from '@/components/calendar/calendar-grid';
import { ReleaseDayList } from '@/components/calendar/release-day-list';
import { useReleaseCalendar, useWatchlistIds } from '@/hooks/use-release-calendar';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useTasteProfile } from '@/hooks/use-taste-profile';
import { addMovieToLibrary, removeMovieFromLibrary } from '@/lib/movie-service';
import { scoreRelease } from '@/lib/taste-profile-service';
import { supabase } from '@/lib/supabase';
import type { TMDBMovie } from '@/lib/tmdb.types';

/** Filter chip configuration */
interface FilterChip {
  key: string;
  label: string;
  types: number[];
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'theatrical', label: 'Theatrical', types: [1, 2, 3] },
  { key: 'streaming', label: 'Streaming', types: [6] },
  { key: 'digital_physical', label: 'Digital / Physical', types: [4, 5] },
];

export default function ReleaseCalendarScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Date state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );

  // Filter state: all release types enabled by default
  const [filterTypes, setFilterTypes] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [showFilters, setShowFilters] = useState(false);

  // Auth & query client
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Data fetching
  const { data, isLoading } = useReleaseCalendar({ month, year });
  const { data: watchlistIds } = useWatchlistIds();
  const { data: tasteProfile } = useTasteProfile();

  // Load saved filter preferences
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('calendar_default_filters')
      .eq('id', user.id)
      .single()
      .then(({ data: profile }) => {
        if (profile?.calendar_default_filters) {
          const saved = profile.calendar_default_filters as { release_types?: number[] };
          if (saved.release_types) {
            setFilterTypes(new Set(saved.release_types));
          }
        }
      });
  }, [user]);

  // Watchlist toggle mutation
  const watchlistMutation = useMutation({
    mutationFn: async ({ tmdbId, isOnWatchlist }: { tmdbId: number; isOnWatchlist: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      if (isOnWatchlist) {
        await removeMovieFromLibrary(user.id, tmdbId);
      } else {
        // Find the CalendarRelease from current data to construct a TMDBMovie
        const release = data?.days
          .flatMap(d => d.releases)
          .find(r => r.tmdb_id === tmdbId);
        if (!release) throw new Error('Release not found');

        const movie: TMDBMovie = {
          id: release.tmdb_id,
          title: release.title,
          overview: '',
          poster_path: release.poster_path,
          backdrop_path: release.backdrop_path,
          genre_ids: release.genre_ids,
          vote_average: release.vote_average,
          vote_count: 0,
          release_date: release.release_date,
        };
        await addMovieToLibrary(user.id, movie, 'watchlist');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist-tmdb-ids'] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  // Get releases for selected date, filtered by type
  const selectedDayReleases = useMemo(() => {
    if (!data || !selectedDate) return [];
    const day = data.days.find(d => d.date === selectedDate);
    if (!day) return [];
    return day.releases.filter(r => filterTypes.has(r.release_type));
  }, [data, selectedDate, filterTypes]);

  // Dates that have watchlist items
  const watchlistDates = useMemo(() => {
    if (!data || !watchlistIds) return [];
    return data.days
      .filter(d => d.releases.some(r => watchlistIds.has(r.tmdb_id)))
      .map(d => d.date);
  }, [data, watchlistIds]);

  // Taste scores for the selected day's releases
  const tasteScores = useMemo(() => {
    if (!tasteProfile || !selectedDayReleases.length) return new Map<number, string | null>();
    const scores = new Map<number, string | null>();
    for (const release of selectedDayReleases) {
      const result = scoreRelease(release.genre_ids, release.tmdb_id, tasteProfile);
      scores.set(release.tmdb_id, result.label);
    }
    return scores;
  }, [tasteProfile, selectedDayReleases]);

  // Dates with taste-matched releases (for golden dots on calendar)
  const personalizedDates = useMemo(() => {
    if (!data || !tasteProfile) return [];
    return data.days
      .filter(d => d.releases.some(r => {
        const result = scoreRelease(r.genre_ids, r.tmdb_id, tasteProfile);
        return result.score >= 50;
      }))
      .map(d => d.date);
  }, [data, tasteProfile]);

  // Navigate to movie detail
  const handleMoviePress = useCallback((tmdbId: number) => {
    router.push(`/movie/${tmdbId}`);
  }, []);

  // Month navigation
  const handleMonthChange = useCallback((newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
    setSelectedDate(null);
  }, []);

  // Toggle watchlist for a release
  const handleToggleWatchlist = useCallback((tmdbId: number) => {
    const isOnWatchlist = watchlistIds?.has(tmdbId) ?? false;
    watchlistMutation.mutate({ tmdbId, isOnWatchlist });
  }, [watchlistIds, watchlistMutation]);

  // Toggle a filter chip (add/remove its types from the active set)
  const toggleFilterChip = useCallback((chip: FilterChip) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      const allActive = chip.types.every(t => next.has(t));
      if (allActive) {
        chip.types.forEach(t => next.delete(t));
      } else {
        chip.types.forEach(t => next.add(t));
      }
      return next;
    });
  }, []);

  // Check if a chip is active
  const isChipActive = useCallback(
    (chip: FilterChip) => chip.types.every(t => filterTypes.has(t)),
    [filterTypes]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Release Calendar
        </Text>

        <Pressable
          onPress={() => setShowFilters(true)}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          hitSlop={8}
        >
          <Ionicons name="options-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Calendar Grid */}
      <CalendarGrid
        year={year}
        month={month}
        selectedDate={selectedDate}
        datesWithReleases={data?.dates_with_releases ?? []}
        watchlistDates={watchlistDates}
        personalizedDates={personalizedDates}
        onSelectDate={setSelectedDate}
        onMonthChange={handleMonthChange}
        isLoading={isLoading}
      />

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Release List */}
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <ReleaseDayList
          date={selectedDate || ''}
          releases={selectedDayReleases}
          watchlistIds={watchlistIds ?? new Set()}
          onMoviePress={handleMoviePress}
          onToggleWatchlist={handleToggleWatchlist}
          tasteScores={tasteScores}
          isLoading={isLoading}
        />
      </ScrollView>

      {/* Filter Bottom Sheet — positioned within page layout, not a Modal */}
      {showFilters && (
        <>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowFilters(false)}
          />
          <View style={[styles.modalPanel, { backgroundColor: colors.card }]}>
            {/* Panel Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Filters
              </Text>
              <Pressable
                onPress={() => setShowFilters(false)}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Release Type Section */}
            <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>
              Release Type
            </Text>

            <View style={styles.chipContainer}>
              {FILTER_CHIPS.map(chip => {
                const active = isChipActive(chip);
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => toggleFilterChip(chip)}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: colors.tint }
                        : { backgroundColor: colors.backgroundSecondary },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${chip.label} filter`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active
                          ? { color: '#ffffff' }
                          : { color: colors.textSecondary },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Apply Button */}
            <Pressable
              onPress={() => {
                setShowFilters(false);
                // Persist filter preferences
                if (user) {
                  supabase
                    .from('profiles')
                    .update({ calendar_default_filters: { release_types: [...filterTypes] } })
                    .eq('id', user.id);
                }
              }}
              style={[styles.applyButton, { backgroundColor: colors.tint }]}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.display.h4,
    fontSize: 20,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
  },

  // Scroll area for releases
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },

  // Filter sheet (absolutely positioned within the page)
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  modalPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    zIndex: 101,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.display.h4,
  },

  // Filter chips
  filterSectionTitle: {
    ...Typography.body.smMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  chipText: {
    ...Typography.body.smMedium,
  },

  // Apply button
  applyButton: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  applyButtonText: {
    ...Typography.button.primary,
    color: '#ffffff',
  },
});
