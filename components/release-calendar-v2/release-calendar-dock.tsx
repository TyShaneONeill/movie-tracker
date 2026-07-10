/**
 * ReleaseCalendarDock
 * Docked bottom sheet with two snap points: a compact week strip (default,
 * mock state B1) and the full month grid (pulled up, mock state B2).
 * Built on @gorhom/bottom-sheet — already a linked dependency (used by
 * components/ui/bottom-sheet-modal.tsx) and already ships in the 1.5.1
 * binary, so this adds no new native module.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';

import CalendarGrid from '@/components/calendar/calendar-grid';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import {
  getWeekDates,
  shiftWeek,
  weekMonthLabel,
  monthLabelText,
} from '@/lib/release-calendar-week';
import { WeekStrip } from './week-strip';

// Collapsed (week-strip) snap height in pixels. Fixed rather than a
// percentage so the results list (release-calendar-v2-screen.tsx) can derive
// its bottom-clearance padding from this exact same constant — the dock
// renders as an absolute overlay (not in normal flex flow), so without this
// shared source of truth the two values could silently drift apart and the
// last list item would scroll behind the dock again. Still an estimate
// pending device QA (see PR notes).
export const WEEK_SNAP_HEIGHT = 150;

// Expanded (month-grid) snap height stays a percentage — it doesn't need to
// be shared with anything outside this component.
const SNAP_POINTS = [WEEK_SNAP_HEIGHT, '52%'];

interface ReleaseCalendarDockProps {
  year: number;
  month: number;
  selectedDate: string;
  datesWithReleases: string[];
  watchlistDates: string[];
  personalizedDates: string[];
  isLoading?: boolean;
  onSelectDate: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function ReleaseCalendarDock({
  year,
  month,
  selectedDate,
  datesWithReleases,
  watchlistDates,
  personalizedDates,
  isLoading,
  onSelectDate,
  onMonthChange,
}: ReleaseCalendarDockProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const sheetRef = useRef<BottomSheet>(null);
  const [expanded, setExpanded] = useState(false);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekLabel = useMemo(
    () => weekMonthLabel(weekDates, selectedDate),
    [weekDates, selectedDate]
  );
  const weekLabelText = monthLabelText(weekLabel.year, weekLabel.month);

  const handleSheetChange = useCallback((index: number) => {
    setExpanded(index === 1);
  }, []);

  // Day tap in either state selects the day; from the expanded month grid it
  // also snaps the dock back to the week strip, centered on the tapped day.
  const handleSelectDate = useCallback(
    (date: string) => {
      onSelectDate(date);
      if (expanded) {
        sheetRef.current?.snapToIndex(0);
      }
    },
    [onSelectDate, expanded]
  );

  const handleWeekNav = useCallback(
    (direction: 'next' | 'prev') => {
      onSelectDate(shiftWeek(selectedDate, direction === 'next' ? 1 : -1));
    },
    [selectedDate, onSelectDate]
  );

  const handleExpand = useCallback(() => {
    sheetRef.current?.snapToIndex(1);
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onChange={handleSheetChange}
      enablePanDownToClose={false}
      backgroundStyle={[styles.background, { backgroundColor: colors.card }]}
      handleIndicatorStyle={[styles.handle, { backgroundColor: colors.border }]}
    >
      <BottomSheetView style={styles.content} testID="release-calendar-v2-dock">
        {expanded ? (
          // Expanded month (B2) — reuse CalendarGrid wholesale (month nav,
          // weekday row, dot semantics) instead of reinventing it. ‹ › here
          // move ±1 month via the same handleMonthChange as v1.
          <View testID="release-calendar-v2-dock-month">
            <CalendarGrid
              year={year}
              month={month}
              selectedDate={selectedDate}
              datesWithReleases={datesWithReleases}
              watchlistDates={watchlistDates}
              personalizedDates={personalizedDates}
              onSelectDate={handleSelectDate}
              onMonthChange={onMonthChange}
              isLoading={isLoading}
            />
          </View>
        ) : (
          // Default week strip (B1) — ‹ › and strip swipes move ±1 week; the
          // month label follows the week per lib/release-calendar-week.ts.
          <View testID="release-calendar-v2-dock-week">
            <View style={styles.weekNavRow}>
              <Pressable
                onPress={() => handleWeekNav('prev')}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                hitSlop={12}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </Pressable>
              <Text style={[Typography.display.h4, { color: colors.tint }]}>{weekLabelText}</Text>
              <Pressable
                onPress={() => handleWeekNav('next')}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                hitSlop={12}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <WeekStrip
              weekDates={weekDates}
              selectedDate={selectedDate}
              datesWithReleases={datesWithReleases}
              watchlistDates={watchlistDates}
              personalizedDates={personalizedDates}
              onSelectDate={handleSelectDate}
              onSwipeWeek={handleWeekNav}
            />
            <Pressable
              onPress={handleExpand}
              style={styles.expandHint}
              accessibilityRole="button"
              accessibilityLabel="Expand to month view"
            >
              <Ionicons name="chevron-up" size={14} color={colors.textSecondary} />
              <Text style={[Typography.body.xs, { color: colors.textSecondary }]}>
                Pull up for month
              </Text>
            </Pressable>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: BorderRadius.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
  },
});
