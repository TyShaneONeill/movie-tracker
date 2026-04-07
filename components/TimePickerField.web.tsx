import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export interface TimePickerFieldProps {
  value: string; // "H:MM AM/PM" or empty string
  onChange: (time: string) => void;
  placeholder?: string;
  containerStyle?: object;
}

function to24h(time12: string): string {
  const match = time12.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function to12h(time24: string): string {
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hours = h % 12 || 12;
  return `${hours}:${String(m).padStart(2, '0')} ${meridiem}`;
}

export function TimePickerField({ value, onChange, containerStyle }: TimePickerFieldProps) {
  const inputValue = value ? to24h(value) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(to12h(e.target.value));
    } else {
      onChange('');
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <span style={{ fontSize: 14, lineHeight: '1' }}>🕐</span>
      <input
        type="time"
        value={inputValue}
        onChange={handleChange}
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
