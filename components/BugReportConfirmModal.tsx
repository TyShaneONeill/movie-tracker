import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface Props {
  visible: boolean;
  onYes: () => void;
  onCancel: () => void;
}

export function BugReportConfirmModal({ visible, onYes, onCancel }: Props) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const s = makeStyles(colors);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>Report a bug?</Text>
          <View style={s.row}>
            <Pressable onPress={onCancel} style={[s.button, s.cancel]} accessibilityRole="button">
              <Text style={s.cancelText}>Not now</Text>
            </Pressable>
            <Pressable onPress={onYes} style={[s.button, s.yes]} accessibilityRole="button">
              <Text style={s.yesText}>Yes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
    sheet: { backgroundColor: colors.background, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
    title: { ...Typography.display.h3, color: colors.text, textAlign: 'center' },
    row: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
    button: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
    cancel: { backgroundColor: colors.backgroundSecondary },
    cancelText: { ...Typography.button.primary, color: colors.text },
    yes: { backgroundColor: colors.tint },
    yesText: { ...Typography.button.primary, color: 'white' },
  });
}
