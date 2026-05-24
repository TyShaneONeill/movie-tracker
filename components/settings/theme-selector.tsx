import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { hapticImpact } from '@/lib/haptics';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { ThemePreference } from '@/lib/database.types';

type EffectiveTheme = 'light' | 'dark';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

interface ThemeSelectorProps {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void | Promise<void>;
  effectiveTheme: EffectiveTheme;
}

export function ThemeSelector({ value, onChange, effectiveTheme }: ThemeSelectorProps) {
  const colors = Colors[effectiveTheme];
  const trackBackground = effectiveTheme === 'dark' ? colors.background : colors.backgroundSecondary;

  return (
    <View style={[styles.track, { backgroundColor: trackBackground }]}>
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              hapticImpact();
              onChange(opt.value);
            }}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: colors.card },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.label} theme`}
          >
            <Text
              style={[
                Typography.body.sm,
                {
                  color: selected ? colors.tint : colors.textSecondary,
                  fontWeight: selected ? '700' : '500',
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    gap: 2,
  },
  option: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
});
