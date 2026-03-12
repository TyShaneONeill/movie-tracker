/**
 * Confirmation Modal
 * Cross-platform replacement for Alert.alert (which is a no-op on web).
 * Bottom sheet modal with title, message, and configurable action buttons.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface ConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  /** Label for the confirm/destructive action button */
  confirmLabel: string;
  /** Called when user taps the confirm button */
  onConfirm: () => void;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /** Whether the confirm action is destructive (shows red) */
  destructive?: boolean;
}

export function ConfirmationModal({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmationModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const handleConfirm = () => {
    hapticImpact();
    onClose();
    onConfirm();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Modal Content */}
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>

          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  backgroundColor: destructive ? '#E53935' : colors.tint,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => {
                hapticImpact();
                onClose();
              }}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                {cancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    ...Typography.display.h3,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...Typography.body.base,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  confirmButton: {
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  cancelButtonText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
});
