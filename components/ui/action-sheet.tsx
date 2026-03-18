import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  options: ActionSheetOption[];
}

export function ActionSheet({ visible, onClose, options }: ActionSheetProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* Options */}
        <View style={styles.options}>
          {options.map((option, index) => (
            <Pressable
              key={index}
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => [
                styles.optionItem,
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  option.destructive && { color: '#EF4444' },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Cancel button */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.xl + (Platform.OS === 'ios' ? 20 : 0),
      ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', left: '50%', transform: [{ translateX: '-50%' }] } : {}),
    },
    handleBar: {
      width: 36,
      height: 4,
      backgroundColor: colors.textTertiary,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: Spacing.sm,
      marginBottom: Spacing.md,
    },
    options: {
      gap: Spacing.sm,
    },
    optionItem: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      alignItems: 'center',
      borderRadius: BorderRadius.md,
      backgroundColor: colors.card,
    },
    optionText: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '500',
    },
    cancelButton: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.card,
      alignItems: 'center',
    },
    cancelText: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '600',
    },
  });
}
