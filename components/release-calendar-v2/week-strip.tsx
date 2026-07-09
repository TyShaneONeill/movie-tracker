/**
 * WeekStrip
 * Compact Sun..Sat row for the docked calendar's default snap point (mock
 * state B1). Selected day is always one of the 7 rendered dates — the week
 * is recomputed from the selected date, so "auto-center" falls out for free
 * instead of needing a scrolling/centering strip.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { WEEKDAY_SHORT } from '@/lib/release-calendar-week';

interface WeekStripProps {
  weekDates: string[]; // 7 dates, Sun..Sat
  selectedDate: string;
  datesWithReleases: string[];
  watchlistDates: string[];
  personalizedDates: string[];
  onSelectDate: (date: string) => void;
  onSwipeWeek: (direction: 'next' | 'prev') => void;
}

export function WeekStrip({
  weekDates,
  selectedDate,
  datesWithReleases,
  watchlistDates,
  personalizedDates,
  onSelectDate,
  onSwipeWeek,
}: WeekStripProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const releaseSet = useMemo(() => new Set(datesWithReleases), [datesWithReleases]);
  const watchlistSet = useMemo(() => new Set(watchlistDates), [watchlistDates]);
  const personalizedSet = useMemo(() => new Set(personalizedDates), [personalizedDates]);

  // Same touch-based swipe detection as components/calendar/calendar-grid.tsx,
  // reused here for weekly (instead of monthly) paging.
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      touchStartRef.current = {
        x: e.nativeEvent.pageX,
        y: e.nativeEvent.pageY,
        time: Date.now(),
      };
    },
    []
  );

  const handleTouchEnd = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      const start = touchStartRef.current;
      if (!start) return;

      const dx = e.nativeEvent.pageX - start.x;
      const dy = e.nativeEvent.pageY - start.y;
      const elapsed = Date.now() - start.time;
      touchStartRef.current = null;

      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 500) {
        onSwipeWeek(dx < 0 ? 'next' : 'prev');
      }
    },
    [onSwipeWeek]
  );

  return (
    <View
      style={styles.row}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      testID="release-calendar-v2-week-strip"
      accessibilityLabel="Swipe left or right to change weeks"
    >
      {weekDates.map((date, i) => {
        const isSelected = date === selectedDate;
        const hasWatchlist = watchlistSet.has(date);
        const hasPersonalized = personalizedSet.has(date);
        const hasRelease = releaseSet.has(date);
        const day = Number(date.slice(8, 10));

        // Dot semantics kept from v1: brand dot = releases, gold dot =
        // watchlist; selected day inverts to white (matches calendar-grid.tsx).
        const dotColor = isSelected
          ? '#ffffff'
          : hasWatchlist
            ? colors.tint
            : hasPersonalized
              ? '#F59E0B'
              : colors.textSecondary;

        return (
          <Pressable
            key={date}
            onPress={() => onSelectDate(date)}
            style={[styles.cell, isSelected && { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`Select ${date}`}
          >
            <Text style={[Typography.body.xs, { color: isSelected ? '#ffffff' : colors.textSecondary }]}>
              {WEEKDAY_SHORT[i]}
            </Text>
            <Text style={[Typography.body.baseMedium, { color: isSelected ? '#ffffff' : colors.text }]}>
              {day}
            </Text>
            {(hasRelease || hasWatchlist || hasPersonalized) && (
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginHorizontal: 2,
    borderRadius: BorderRadius.md,
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
