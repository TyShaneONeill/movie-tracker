/**
 * Release Calendar v2 Screen
 * Results-first layout (mock Variant B, locked 2026-07-09): always-visible
 * filter chips + release list own the screen; the calendar is a docked
 * bottom sheet (week strip / month grid). Behind the `release_calendar_v2`
 * flag — see hooks/use-release-calendar-v2.ts.
 *
 * Data wiring intentionally mirrors app/release-calendar.tsx (v1) rather
 * than sharing a hook, matching the stats_v2 precedent (StatsV2Screen also
 * re-derives its own state instead of importing from AnalyticsV1Screen) —
 * keeps v1's file byte-identical when the flag is off.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ReleaseDayList } from '@/components/calendar/release-day-list';
import { useReleaseCalendar, useWatchlistIds } from '@/hooks/use-release-calendar';
import { useCalendarFilters } from '@/hooks/use-calendar-filters';
import { ContentContainer } from '@/components/content-container';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { useTasteProfile } from '@/hooks/use-taste-profile';
import { addMovieToLibrary, removeMovieFromLibrary } from '@/lib/movie-service';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import { scoreRelease } from '@/lib/taste-profile-service';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { filterDatesByWatchlist, filterDayReleases } from '@/lib/calendar-filters';
import { formatDayHeader } from '@/lib/release-calendar-week';
import { FilterChipRow } from './filter-chip-row';
import { ReleaseCalendarDock, WEEK_SNAP_HEIGHT } from './release-calendar-dock';

export function ReleaseCalendarV2Screen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Date state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );

  // Bottom clearance for the results list so its last item can scroll fully
  // above the docked calendar, which renders as an absolute overlay (not in
  // normal flex flow) and would otherwise cover it. Derived from the same
  // WEEK_SNAP_HEIGHT constant that defines the dock's collapsed snap point,
  // so the two can't drift apart — plus the bottom safe-area inset (home
  // indicator). Deliberately static (collapsed-state height only): the
  // expanded month grid temporarily covering more of the list is standard
  // bottom-sheet behavior, not re-padded on snap changes.
  const insets = useSafeAreaInsets();
  const dockClearance = WEEK_SNAP_HEIGHT + insets.bottom;

  // Auth & query client
  const { user } = useAuth();
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();
  const queryClient = useQueryClient();

  // Filter state (same hook as v1)
  const { filterTypes, watchlistOnly, setWatchlistOnly, toggleFilterChip, isChipActive } =
    useCalendarFilters(user);

  // Data fetching — same month-window hooks as v1, no backend changes.
  const { data, isLoading } = useReleaseCalendar({ month, year });
  const { data: watchlistIds } = useWatchlistIds(!!user);
  const { data: tasteProfile } = useTasteProfile();

  // Watchlist toggle mutation
  const watchlistMutation = useMutation({
    mutationFn: async ({ tmdbId, isOnWatchlist }: { tmdbId: number; isOnWatchlist: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      if (isOnWatchlist) {
        await removeMovieFromLibrary(user.id, tmdbId);
      } else {
        const release = data?.days
          .flatMap((d) => d.releases)
          .find((r) => r.tmdb_id === tmdbId);
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
      invalidateUserMovieQueries(queryClient);
    },
  });

  // Get releases for selected date, filtered by type and watchlist
  const selectedDayReleases = useMemo(() => {
    if (!data || !selectedDate) return [];
    const day = data.days.find((d) => d.date === selectedDate);
    if (!day) return [];
    return filterDayReleases(day.releases, filterTypes, watchlistIds, watchlistOnly);
  }, [data, selectedDate, filterTypes, watchlistIds, watchlistOnly]);

  // Dates that have watchlist items
  const watchlistDates = useMemo(() => {
    if (!data || !watchlistIds) return [];
    return data.days
      .filter((d) => d.releases.some((r) => watchlistIds.has(r.tmdb_id)))
      .map((d) => d.date);
  }, [data, watchlistIds]);

  // Dates with releases respecting the watchlistOnly filter (drives dots)
  const filteredDatesWithReleases = useMemo(
    () =>
      filterDatesByWatchlist(
        data?.days ?? [],
        watchlistIds,
        watchlistOnly,
        data?.dates_with_releases ?? []
      ),
    [data, watchlistIds, watchlistOnly]
  );

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

  // Dates with taste-matched releases (for golden dots on the dock)
  const personalizedDates = useMemo(() => {
    if (!tasteProfile || !data) return [];
    return data.days
      .filter((d) =>
        d.releases.some((r) => {
          if (watchlistOnly && !(watchlistIds?.has(r.tmdb_id) ?? false)) return false;
          const result = scoreRelease(r.genre_ids, r.tmdb_id, tasteProfile);
          return result.score >= 50;
        })
      )
      .map((d) => d.date);
  }, [data, watchlistOnly, watchlistIds, tasteProfile]);

  // Navigate to movie detail
  const handleMoviePress = useCallback((tmdbId: number) => {
    router.push(`/movie/${tmdbId}`);
  }, []);

  // Month navigation from the expanded dock — same semantics as v1's
  // handleMonthChange: default selectedDate to today when landing on the
  // current month, else the 1st, so the day header always has a valid date.
  const handleMonthChange = useCallback((newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
    const today = new Date();
    const isCurrentMonth =
      newYear === today.getFullYear() && newMonth === today.getMonth() + 1;
    const day = isCurrentMonth ? today.getDate() : 1;
    const mm = String(newMonth).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    setSelectedDate(`${newYear}-${mm}-${dd}`);
  }, []);

  // Selecting a day (week-strip tap, month-grid tap, or ±1 week paging) keeps
  // the loaded month window in sync with whichever month the selection lands
  // in — crossing a month boundary triggers the existing useReleaseCalendar
  // load for that month. Data behavior is otherwise unchanged from v1.
  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    const [y, m] = date.split('-').map(Number);
    setYear(y);
    setMonth(m);
  }, []);

  // Toggle watchlist for a release
  const handleToggleWatchlist = useCallback(
    (tmdbId: number) => {
      requireAuth(() => {
        const isOnWatchlist = watchlistIds?.has(tmdbId) ?? false;
        watchlistMutation.mutate({ tmdbId, isOnWatchlist });
      }, 'Sign in to manage your watchlist');
    },
    [requireAuth, watchlistIds, watchlistMutation]
  );

  // True when watchlistOnly is on but the user has zero watchlist items
  const watchlistOnlyEmpty = watchlistOnly && (watchlistIds?.size ?? 0) === 0;

  // No count header while the initial load is in flight — ReleaseDayList's
  // own skeleton takes over instead (same as v1, which shows no header there).
  const dayHeaderText = isLoading ? null : formatDayHeader(selectedDate, selectedDayReleases.length);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
      testID="release-calendar-v2-screen"
    >
      <ContentContainer style={{ flex: 1 }}>
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

          {/* Invisible spacer balancing the back button so the title stays
              centered — the chip row below is the canonical filter UI in v2,
              so there's no second header action (no redundant filter sheet). */}
          <View style={styles.headerButton} />
        </View>

        {/* Always-visible filter chips */}
        <FilterChipRow
          watchlistOnly={watchlistOnly}
          onToggleWatchlistOnly={() => setWatchlistOnly(!watchlistOnly)}
          isChipActive={isChipActive}
          onToggleChip={toggleFilterChip}
          showWatchlistChip={!!user}
        />

        {/* Results — day header with count, then the release list */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={{ paddingBottom: dockClearance }}
          testID="release-calendar-v2-results-scroll"
        >
          {dayHeaderText && (
            <Text
              style={[styles.dayHeader, { color: colors.textSecondary }]}
              testID="release-calendar-v2-day-header"
            >
              {dayHeaderText}
            </Text>
          )}
          <ReleaseDayList
            date={selectedDate}
            releases={selectedDayReleases}
            watchlistIds={watchlistIds ?? new Set()}
            onMoviePress={handleMoviePress}
            onToggleWatchlist={handleToggleWatchlist}
            tasteScores={tasteScores}
            isLoading={isLoading}
            watchlistOnlyEmpty={watchlistOnlyEmpty}
            hideHeader
          />
        </ScrollView>
      </ContentContainer>

      {/* Docked calendar — week strip / month grid, pinned below the results */}
      <ReleaseCalendarDock
        year={year}
        month={month}
        selectedDate={selectedDate}
        datesWithReleases={filteredDatesWithReleases}
        watchlistDates={watchlistDates}
        personalizedDates={personalizedDates}
        isLoading={isLoading}
        onSelectDate={handleSelectDate}
        onMonthChange={handleMonthChange}
      />

      <LoginPromptModal
        visible={isLoginPromptVisible}
        onClose={hideLoginPrompt}
        message={loginPromptMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
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

  dayHeader: {
    ...Typography.body.smMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },

  scrollArea: {
    flex: 1,
  },
});
