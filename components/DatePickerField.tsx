import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export interface DatePickerFieldProps {
  value: string; // YYYY-MM-DD or empty string
  onChange: (date: string) => void;
  placeholder?: string;
  containerStyle?: object;
}

function parseDateStr(dateStr: string): Date {
  if (!dateStr) return new Date();
  // YYYY-MM-DD (Gemini standard output)
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }
  // MM/DD/YYYY or M/D/YY
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    const year = Number(mdy[3]) < 100 ? 2000 + Number(mdy[3]) : Number(mdy[3]);
    const d = new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));
    if (!isNaN(d.getTime())) return d;
  }
  // Let JS try anything else (handles "Feb 21, 2025" etc.)
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePickerField({ value, onChange, placeholder = 'Select date', containerStyle }: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(() => parseDateStr(value));

  const displayText = value ? formatDateDisplay(value) : '';

  const handlePress = () => {
    setPendingDate(parseDateStr(value));
    setShowPicker(true);
  };

  const handleChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (selectedDate) {
        onChange(formatDateValue(selectedDate));
      }
    } else if (selectedDate) {
      setPendingDate(selectedDate);
    }
  };

  const handleDone = () => {
    setShowPicker(false);
    onChange(formatDateValue(pendingDate));
  };

  const handleCancel = () => {
    setShowPicker(false);
  };

  return (
    <View style={containerStyle}>
      <Pressable style={styles.pressable} onPress={handlePress}>
        <Text style={styles.icon}>📅</Text>
        <Text style={[styles.text, !value && styles.placeholder]}>
          {displayText || placeholder}
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
              value={pendingDate}
              mode="date"
              display="spinner"
              onChange={handleChange}
              textColor="#ffffff"
            />
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={pendingDate}
          mode="date"
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
