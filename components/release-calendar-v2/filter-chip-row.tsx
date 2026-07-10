/**
 * FilterChipRow
 * Always-visible filter chips for Release Calendar v2 (mock section
 * "Shared decisions": filters move from a hidden sheet to a glanceable
 * chip row — one tap instead of two). The header's gear icon still opens
 * the full filter sheet for the long tail.
 */

import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { FILTER_CHIPS, type FilterChip } from '@/hooks/use-calendar-filters';

interface FilterChipRowProps {
  watchlistOnly: boolean;
  onToggleWatchlistOnly: () => void;
  isChipActive: (chip: FilterChip) => boolean;
  onToggleChip: (chip: FilterChip) => void;
  /** Hide the watchlist-only chip for guests, matching the existing sheet's auth gate. */
  showWatchlistChip: boolean;
}

export function FilterChipRow({
  watchlistOnly,
  onToggleWatchlistOnly,
  isChipActive,
  onToggleChip,
  showWatchlistChip,
}: FilterChipRowProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
      testID="release-calendar-v2-chip-row"
    >
      {showWatchlistChip && (
        <Chip
          label="My watchlist"
          active={watchlistOnly}
          onPress={onToggleWatchlistOnly}
          colors={colors}
        />
      )}
      {FILTER_CHIPS.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          active={isChipActive(chip)}
          onPress={() => onToggleChip(chip)}
          colors={colors}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: (typeof Colors)['dark'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.tint : colors.backgroundSecondary,
          borderColor: active ? colors.tint : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} filter`}
    >
      <Text style={[styles.chipText, { color: active ? '#ffffff' : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 0,
  },
  rowContent: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    ...Typography.body.smMedium,
  },
});
