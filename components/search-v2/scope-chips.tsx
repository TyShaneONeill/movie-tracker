/**
 * ScopeChips — All · Movies · TV · People · Users (Proposal 01.2).
 *
 * Chips scope the already-fetched unified results after the fact; they never
 * refetch. Active chip: rose border, ink label, rose count. Inactive: hairline
 * border, neutral label, dim count.
 *
 * Content counts (movie/tv/person, and their All total) come from the unified
 * result set. The Users chip is backed by a separate on-demand query, so its
 * count is only shown once that query has run (while the Users scope is active).
 */

import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { SearchScope, ScopeCounts } from '@/lib/search-v2-logic';

interface ScopeChipsProps {
  active: SearchScope;
  counts: ScopeCounts;
  /** Users result count, or null when not yet fetched. */
  userCount: number | null;
  onChange: (scope: SearchScope) => void;
}

interface ChipSpec {
  scope: SearchScope;
  label: string;
  count: number | null;
}

export function ScopeChips({ active, counts, userCount, onChange }: ScopeChipsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const chips: ChipSpec[] = [
    { scope: 'all', label: 'All', count: counts.all },
    { scope: 'movie', label: 'Movies', count: counts.movie },
    { scope: 'tv', label: 'TV', count: counts.tv },
    { scope: 'person', label: 'People', count: counts.person },
    { scope: 'user', label: 'Users', count: userCount },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const isActive = chip.scope === active;
        return (
          <Pressable
            key={chip.scope}
            onPress={() => onChange(chip.scope)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={
              chip.count != null ? `${chip.label}, ${chip.count} results` : chip.label
            }
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
            {chip.count != null && (
              <Text
                style={[
                  styles.count,
                  { color: isActive ? colors.tint : colors.textTertiary },
                ]}
              >
                {chip.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  label: {
    fontSize: 12.5,
  },
  labelActive: {
    fontWeight: '600',
  },
  count: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
});
