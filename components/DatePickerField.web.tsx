import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export interface DatePickerFieldProps {
  value: string; // YYYY-MM-DD or empty string
  onChange: (date: string) => void;
  placeholder?: string;
  containerStyle?: object;
}

export function DatePickerField({ value, onChange, containerStyle }: DatePickerFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <span style={{ fontSize: 14, lineHeight: '1' }}>📅</span>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: value ? Colors.dark.text : Colors.dark.textTertiary,
          fontSize: 15,
          fontFamily: 'inherit',
          cursor: 'pointer',
          colorScheme: 'dark',
        } as React.CSSProperties}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
});
