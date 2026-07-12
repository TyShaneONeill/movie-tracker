/**
 * FirstTakesScopeChips — All / Movies / TV with live counts (contract note F2).
 *
 * One combined chronological diary; these chips filter it client-side. Rendered
 * ONLY when the user has BOTH media types (the parent decides via
 * shouldShowScopeChips). Active chip: rose border + ink label + rose count.
 * Mirrors the Search v2 scope-chip pattern.
 */

import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { FirstTakesScope, ScopeCounts } from '@/lib/first-takes-v2-logic';

interface FirstTakesScopeChipsProps {
  active: FirstTakesScope;
  counts: ScopeCounts;
  onChange: (scope: FirstTakesScope) => void;
  /** Screen-reader noun for the count ("6 takes" / "6 reviews"). */
  noun?: string;
}

export function FirstTakesScopeChips({ active, counts, onChange, noun = 'takes' }: FirstTakesScopeChipsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const chips: { scope: FirstTakesScope; label: string; count: number }[] = [
    { scope: 'all', label: 'All', count: counts.all },
    { scope: 'movie', label: 'Movies', count: counts.movie },
    { scope: 'tv', label: 'TV', count: counts.tv },
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
            accessibilityLabel={`${chip.label}, ${chip.count} ${noun}`}
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
            <Text style={[styles.count, { color: isActive ? colors.tint : colors.textTertiary }]}>
              {chip.count}
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
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  count: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
});
