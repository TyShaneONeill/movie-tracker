import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /**
   * Optional one-line descriptor rendered beside the label. Presence switches
   * the row to the left-aligned "detailed" layout (label + description + tick).
   */
  description?: string;
  /** Marks the current selection — renders a tint ✓ and tints the label. */
  selected?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  options: ActionSheetOption[];
  /** Optional uppercase section header shown above the options. */
  title?: string;
}

export function ActionSheet({ visible, onClose, options, title }: ActionSheetProps) {
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

        {title != null && (
          <Text style={[styles.title, { color: colors.textTertiary }]}>{title}</Text>
        )}

        {/* Options */}
        <View style={styles.options}>
          {options.map((option, index) => {
            // A description or an explicit selection opts the row into the
            // detailed (left-aligned) layout. Plain option lists keep the
            // original centered card so existing callers are untouched.
            const detailed = option.description != null || option.selected != null;
            return (
              <Pressable
                key={index}
                onPress={() => {
                  onClose();
                  option.onPress();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: option.selected }}
                style={({ pressed }) => [
                  styles.optionItem,
                  detailed && styles.optionItemDetailed,
                  pressed && { backgroundColor: colors.backgroundSecondary },
                ]}
              >
                {detailed ? (
                  <>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: option.selected ? colors.tint : colors.text },
                        option.destructive && { color: '#EF4444' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.description != null && (
                      <Text style={[styles.optionDescription, { color: colors.textTertiary }]}>
                        {option.description}
                      </Text>
                    )}
                    {option.selected && (
                      <Text style={[styles.optionTick, { color: colors.tint }]}>✓</Text>
                    )}
                  </>
                ) : (
                  <Text
                    style={[
                      styles.optionText,
                      option.destructive && { color: '#EF4444' },
                    ]}
                  >
                    {option.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
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
    title: {
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      fontWeight: '700',
      marginBottom: Spacing.sm,
      marginLeft: Spacing.xs,
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
    // Detailed rows read like a ledger line: label + descriptor left, tick right.
    optionItemDetailed: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'flex-start',
      gap: Spacing.sm,
    },
    optionText: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '500',
    },
    optionLabel: {
      ...Typography.body.base,
      fontWeight: '600',
    },
    optionDescription: {
      ...Typography.body.sm,
    },
    optionTick: {
      marginLeft: 'auto',
      fontWeight: '700',
      fontSize: 15,
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
