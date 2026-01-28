import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import type { MovieStatus } from '@/lib/database.types';

interface WatchlistOption {
  status: MovieStatus;
  label: string;
  icon: string;
  description: string;
}

const WATCHLIST_OPTIONS: WatchlistOption[] = [
  {
    status: 'watchlist',
    label: 'Want to Watch',
    icon: '📋',
    description: 'Add to your watchlist',
  },
  {
    status: 'watching',
    label: 'Currently Watching',
    icon: '▶️',
    description: 'Mark as in progress',
  },
  {
    status: 'watched',
    label: 'Watched',
    icon: '✅',
    description: 'Mark as completed',
  },
];

interface WatchlistModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (status: MovieStatus) => void;
  onRemove?: () => void;
  currentStatus: MovieStatus | null;
  isLoading?: boolean;
  movieTitle?: string;
  hasFirstTake?: boolean;
}

export function WatchlistModal({
  visible,
  onClose,
  onSelect,
  onRemove,
  currentStatus,
  isLoading = false,
  movieTitle,
  hasFirstTake = false,
}: WatchlistModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = React.useState(false);

  // Reset confirmation state when modal closes
  const handleClose = () => {
    setShowRemoveConfirmation(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View style={styles.container}>
          <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Add to List</Text>
              {movieTitle && (
                <Text style={styles.movieTitle} numberOfLines={1}>
                  {movieTitle}
                </Text>
              )}
            </View>

            {/* Options */}
            <View style={styles.options}>
              {WATCHLIST_OPTIONS.map((option) => {
                const isSelected = currentStatus === option.status;
                return (
                  <Pressable
                    key={option.status}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={() => onSelect(option.status)}
                    disabled={isLoading}
                  >
                    <Text style={styles.optionIcon}>{option.icon}</Text>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {option.label}
                      </Text>
                      <Text style={styles.optionDescription}>{option.description}</Text>
                    </View>
                    {isSelected && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                    {isLoading && isSelected && (
                      <ActivityIndicator size="small" color={colors.tint} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Remove button (only shown if already in list) */}
            {currentStatus && onRemove && !showRemoveConfirmation && (
              <Pressable
                style={({ pressed }) => [
                  styles.removeButton,
                  pressed && styles.removeButtonPressed,
                ]}
                onPress={() => {
                  if (hasFirstTake) {
                    setShowRemoveConfirmation(true);
                  } else {
                    onRemove();
                  }
                }}
                disabled={isLoading}
              >
                <Text style={styles.removeButtonText}>Remove from List</Text>
              </Pressable>
            )}

            {/* Remove confirmation (shown when user has First Take) */}
            {showRemoveConfirmation && (
              <View style={styles.confirmationContainer}>
                <Text style={styles.confirmationText}>
                  This will also delete your First Take for this movie.
                </Text>
                <View style={styles.confirmationButtons}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmationButton,
                      styles.confirmationButtonCancel,
                      pressed && styles.confirmationButtonPressed,
                    ]}
                    onPress={() => setShowRemoveConfirmation(false)}
                    disabled={isLoading}
                  >
                    <Text style={styles.confirmationButtonCancelText}>Keep Movie</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmationButton,
                      styles.confirmationButtonConfirm,
                      pressed && styles.confirmationButtonPressed,
                    ]}
                    onPress={() => {
                      setShowRemoveConfirmation(false);
                      onRemove?.();
                    }}
                    disabled={isLoading}
                  >
                    <Text style={styles.confirmationButtonConfirmText}>Remove Both</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Cancel button */}
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.cancelButtonPressed,
              ]}
              onPress={handleClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      paddingBottom: 34, // Safe area
    },
    content: {
      padding: Spacing.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      ...Typography.display.h4,
      color: colors.text,
      marginBottom: Spacing.xs,
    },
    movieTitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    options: {
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      backgroundColor: colors.background,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionSelected: {
      borderColor: colors.tint,
      backgroundColor: 'rgba(225, 29, 72, 0.1)',
    },
    optionPressed: {
      opacity: 0.7,
    },
    optionIcon: {
      fontSize: 24,
      marginRight: Spacing.md,
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '600',
    },
    optionLabelSelected: {
      color: colors.tint,
    },
    optionDescription: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    checkmark: {
      fontSize: 18,
      color: colors.tint,
      fontWeight: '600',
    },
    removeButton: {
      padding: Spacing.md,
      alignItems: 'center',
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: 'rgba(255, 68, 68, 0.3)',
      marginBottom: Spacing.sm,
    },
    removeButtonPressed: {
      opacity: 0.7,
    },
    removeButtonText: {
      ...Typography.body.base,
      color: '#ff4444',
      fontWeight: '600',
    },
    cancelButton: {
      padding: Spacing.md,
      alignItems: 'center',
      backgroundColor: colors.tint,
      borderRadius: BorderRadius.md,
    },
    cancelButtonPressed: {
      opacity: 0.9,
    },
    cancelButtonText: {
      ...Typography.body.base,
      color: '#fff',
      fontWeight: '600',
    },
    confirmationContainer: {
      padding: Spacing.md,
      backgroundColor: 'rgba(255, 68, 68, 0.1)',
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: 'rgba(255, 68, 68, 0.3)',
      marginBottom: Spacing.sm,
    },
    confirmationText: {
      ...Typography.body.sm,
      color: '#ff6b6b',
      textAlign: 'center',
      marginBottom: Spacing.md,
    },
    confirmationButtons: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    confirmationButton: {
      flex: 1,
      padding: Spacing.sm,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
    },
    confirmationButtonCancel: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmationButtonConfirm: {
      backgroundColor: '#ff4444',
    },
    confirmationButtonPressed: {
      opacity: 0.7,
    },
    confirmationButtonCancelText: {
      ...Typography.body.sm,
      color: colors.text,
      fontWeight: '600',
    },
    confirmationButtonConfirmText: {
      ...Typography.body.sm,
      color: '#fff',
      fontWeight: '600',
    },
  });
