/**
 * FeedFilterChips — All / First Takes / Reviews / Friends (contract note E /
 * Decision 1). Standard rounded chip style, no counts (a paginated feed can't
 * count honestly). Active chip: rose border + ink label. Mirrors the profile v2
 * scope-chip visual family.
 */

import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { FEED_V2_FILTERS, type FeedV2Filter } from '@/lib/feed-v2-logic';

interface FeedFilterChipsProps {
  active: FeedV2Filter;
  onChange: (filter: FeedV2Filter) => void;
}

export function FeedFilterChips({ active, onChange }: FeedFilterChipsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {FEED_V2_FILTERS.map((chip) => {
        const isActive = chip.value === active;
        return (
          <Pressable
            key={chip.value}
            onPress={() => onChange(chip.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filter by ${chip.label}`}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: isActive ? colors.tint : colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.text : colors.textSecondary },
                isActive && styles.labelActive,
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  label: {
    fontSize: 11.5,
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: '600',
  },
});
