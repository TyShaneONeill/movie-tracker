import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useReport } from '@/hooks/use-report';
import type { ReportTargetType, ReportReason } from '@/lib/report-service';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'other', label: 'Other' },
];

export function ReportModal({ visible, onClose, targetType, targetId }: ReportModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { report, isReporting } = useReport();

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!selectedReason) return;
    try {
      await report({
        targetType,
        targetId,
        reason: selectedReason,
        description: description.trim() || undefined,
      });
      // Reset and close on success
      setSelectedReason(null);
      setDescription('');
      onClose();
    } catch {
      // Error handled in useReport hook
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    setDescription('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Report</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Why are you reporting this {targetType === 'first_take' ? 'first take' : targetType}?
          </Text>

          {/* Reason picker */}
          <View style={styles.reasons}>
            {REASONS.map(({ value, label }) => {
              const isSelected = selectedReason === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSelectedReason(value)}
                  style={[
                    styles.reasonItem,
                    isSelected && { borderColor: colors.tint, backgroundColor: `${colors.tint}15` },
                  ]}
                >
                  <Text style={[styles.reasonText, isSelected && { color: colors.tint }]}>
                    {label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.tint} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Optional description */}
          <TextInput
            style={styles.input}
            placeholder="Additional details (optional)"
            placeholderTextColor={colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={!selectedReason || isReporting}
            style={({ pressed }) => [
              styles.submitButton,
              !selectedReason && styles.submitButtonDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            {isReporting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.submitText}>Submit Report</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.xl + (Platform.OS === 'ios' ? 20 : 0),
      maxHeight: '80%',
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    title: {
      ...Typography.display.h3,
      color: colors.text,
    },
    subtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.lg,
    },
    reasons: {
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    reasonItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    reasonText: {
      ...Typography.body.base,
      color: colors.text,
    },
    input: {
      ...Typography.body.sm,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      minHeight: 80,
      marginBottom: Spacing.lg,
    },
    submitButton: {
      backgroundColor: '#EF4444',
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    submitButtonDisabled: {
      opacity: 0.4,
    },
    submitText: {
      ...Typography.body.baseMedium,
      color: 'white',
      fontWeight: '600',
    },
  });
}

export default ReportModal;
