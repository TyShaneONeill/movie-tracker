/**
 * CalendarGrid Component
 * Month-view calendar grid for the Release Calendar feature.
 * Displays a navigable month grid with day cells, "today" highlighting,
 * selected-day ring, and dot indicators for release dates.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface CalendarGridProps {
  year: number;
  month: number; // 1-12
  selectedDate: string | null; // YYYY-MM-DD or null
  datesWithReleases: string[]; // YYYY-MM-DD strings from API
  watchlistDates?: string[]; // dates where user has watchlist items releasing
  onSelectDate: (date: string) => void; // YYYY-MM-DD
  onMonthChange: (year: number, month: number) => void;
  isLoading?: boolean;
}

interface DayCell {
  day: number; // 0 = empty padding cell
  dateString: string; // YYYY-MM-DD or ''
  isToday: boolean;
  isSelected: boolean;
  hasRelease: boolean;
  hasWatchlistRelease: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format a day number into YYYY-MM-DD */
function formatDateString(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Get today's date as YYYY-MM-DD */
function getTodayString(): string {
  const now = new Date();
  return formatDateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export default function CalendarGrid({
  year,
  month,
  selectedDate,
  datesWithReleases,
  watchlistDates = [],
  onSelectDate,
  onMonthChange,
  isLoading = false,
}: CalendarGridProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const todayString = useMemo(() => getTodayString(), []);

  // Build sets for O(1) lookups
  const releaseDateSet = useMemo(
    () => new Set(datesWithReleases),
    [datesWithReleases],
  );
  const watchlistDateSet = useMemo(
    () => new Set(watchlistDates),
    [watchlistDates],
  );

  // Compute the grid of day cells for the current month
  const dayCells = useMemo((): DayCell[] => {
    // Number of days in this month
    const daysInMonth = new Date(year, month, 0).getDate();
    // Day of week for the 1st (0 = Sunday)
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

    const cells: DayCell[] = [];

    // Leading empty cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        day: 0,
        dateString: '',
        isToday: false,
        isSelected: false,
        hasRelease: false,
        hasWatchlistRelease: false,
      });
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = formatDateString(year, month, d);
      cells.push({
        day: d,
        dateString,
        isToday: dateString === todayString,
        isSelected: dateString === selectedDate,
        hasRelease: releaseDateSet.has(dateString),
        hasWatchlistRelease: watchlistDateSet.has(dateString),
      });
    }

    return cells;
  }, [year, month, todayString, selectedDate, releaseDateSet, watchlistDateSet]);

  const handlePrevMonth = useCallback(() => {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  }, [year, month, onMonthChange]);

  const handleNextMonth = useCallback(() => {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  }, [year, month, onMonthChange]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <View style={styles.container}>
      {/* Month selector header */}
      <View style={styles.monthHeader}>
        <Pressable
          onPress={handlePrevMonth}
          style={({ pressed }) => [
            styles.arrowButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          hitSlop={12}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={styles.monthLabelContainer}>
          <Text style={[Typography.display.h4, { color: colors.tint }]}>
            {monthLabel}
          </Text>
          {isLoading && (
            <ActivityIndicator
              size="small"
              color={colors.tint}
              style={styles.loadingIndicator}
            />
          )}
        </View>

        <Pressable
          onPress={handleNextMonth}
          style={({ pressed }) => [
            styles.arrowButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          hitSlop={12}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayCell}>
            <Text
              style={[
                Typography.body.sm,
                { color: colors.textSecondary },
              ]}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.dayGrid}>
        {dayCells.map((cell, index) => {
          if (cell.day === 0) {
            // Empty padding cell
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          return (
            <DayCellView
              key={cell.dateString}
              cell={cell}
              colors={colors}
              onPress={onSelectDate}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Individual day cell component, extracted for clarity */
const DayCellView = React.memo(function DayCellView({
  cell,
  colors,
  onPress,
}: {
  cell: DayCell;
  colors: (typeof Colors)['dark'];
  onPress: (date: string) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(cell.dateString);
  }, [cell.dateString, onPress]);

  // Determine the background and border style for the day circle
  const circleStyle = useMemo(() => {
    const base: Record<string, unknown> = {};

    if (cell.isToday) {
      base.backgroundColor = colors.tint;
    }

    if (cell.isSelected) {
      base.borderWidth = 2;
      base.borderColor = colors.tint;
    }

    return base;
  }, [cell.isToday, cell.isSelected, colors.tint]);

  // Text color: white on the filled "today" circle, primary otherwise
  const dayTextColor = cell.isToday ? '#ffffff' : colors.text;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.dayCell,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.dayCircle, circleStyle]}>
        <Text style={[Typography.body.base, { color: dayTextColor }]}>
          {cell.day}
        </Text>
      </View>

      {/* Dot indicators */}
      {(cell.hasRelease || cell.hasWatchlistRelease) && (
        <View style={styles.dotRow}>
          {cell.hasWatchlistRelease && (
            <View
              style={[styles.dot, { backgroundColor: colors.tint }]}
            />
          )}
          {cell.hasRelease && !cell.hasWatchlistRelease && (
            <View
              style={[
                styles.dot,
                { backgroundColor: colors.textSecondary },
              ]}
            />
          )}
          {cell.hasRelease && cell.hasWatchlistRelease && (
            <View
              style={[
                styles.dot,
                { backgroundColor: colors.textSecondary },
              ]}
            />
          )}
        </View>
      )}
    </Pressable>
  );
});

const DAY_CIRCLE_SIZE = 36;
const DOT_SIZE = 4;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },

  // Month header
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  arrowButton: {
    padding: Spacing.sm,
  },
  monthLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingIndicator: {
    marginLeft: Spacing.xs,
  },

  // Weekday row
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },

  // Day grid
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%', // 100% / 7 columns
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    minHeight: 48,
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dots
  dotRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 3,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
