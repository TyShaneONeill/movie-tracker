import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export interface TimePickerFieldProps {
  value: string; // "H:MM AM/PM" or empty string
  onChange: (time: string) => void;
  placeholder?: string;
  containerStyle?: object;
}

function parseTimeStr(timeStr: string): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  if (!timeStr) { d.setHours(19, 0); return d; }

  // Strip trailing timezone info (e.g. "7:00 PM EST" -> "7:00 PM")
  const clean = timeStr.trim().replace(/\s+[A-Z]{2,4}$/, '');

  // H:MM AM/PM or H:MMAM/PM (with or without space before meridiem)
  const ampm = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const minutes = parseInt(ampm[2], 10);
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, minutes);
    return d;
  }

  // HH:MM 24-hour (e.g. "19:00")
  const h24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    d.setHours(parseInt(h24[1], 10), parseInt(h24[2], 10));
    return d;
  }

  // H AM/PM no minutes (e.g. "7PM")
  const noMin = clean.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (noMin) {
    let hours = parseInt(noMin[1], 10);
    const meridiem = noMin[2].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, 0);
    return d;
  }

  d.setHours(19, 0);
  return d;
}

function formatTimeDisplay(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

export function TimePickerField({ value, onChange, placeholder = 'Select time', containerStyle }: TimePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pendingTime, setPendingTime] = useState<Date>(() => parseTimeStr(value));

  const handlePress = () => {
    setPendingTime(parseTimeStr(value));
    setShowPicker(true);
  };

  const handleChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (selectedDate) {
        onChange(formatTimeDisplay(selectedDate));
      }
    } else if (selectedDate) {
      setPendingTime(selectedDate);
    }
  };

  const handleDone = () => {
    setShowPicker(false);
    onChange(formatTimeDisplay(pendingTime));
  };

  const handleCancel = () => {
    setShowPicker(false);
  };

  return (
    <View style={containerStyle}>
      <Pressable style={styles.pressable} onPress={handlePress}>
        <Text style={styles.icon}>🕐</Text>
        <Text style={[styles.text, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && showPicker && (
        <Modal transparent animationType="slide" visible>
          <Pressable style={styles.backdrop} onPress={handleCancel} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Pressable onPress={handleCancel}>
                <Text style={styles.headerBtn}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleDone}>
                <Text style={[styles.headerBtn, styles.doneBtn]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pendingTime}
              mode="time"
              display="spinner"
              onChange={handleChange}
              textColor="#ffffff"
            />
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={pendingTime}
          mode="time"
          display="default"
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 8,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    color: Colors.dark.text,
    fontSize: 15,
    flex: 1,
  },
  placeholder: {
    color: Colors.dark.textTertiary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerSheet: {
    backgroundColor: Colors.dark.card,
    paddingBottom: 34,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerBtn: {
    ...Typography.body.base,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },
  doneBtn: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
});
