import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Keyboard,
} from 'react-native';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import Toast from 'react-native-toast-message';
import Slider from '@react-native-community/slider';
import { Colors, Spacing, BorderRadius, Shadows, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import type { ReviewVisibility } from '@/lib/database.types';

const MAX_QUOTE_LENGTH = 140;

const VISIBILITY_OPTIONS: { value: ReviewVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'followers_only', label: 'Followers' },
  { value: 'private', label: 'Private' },
];

interface FirstTakeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { rating: number; quoteText: string; isSpoiler: boolean; visibility: ReviewVisibility }) => Promise<void>;
  movieTitle: string;
  moviePosterUrl?: string;
  isSubmitting?: boolean;
}

export function FirstTakeModal({
  visible,
  onClose,
  onSubmit,
  movieTitle,
  moviePosterUrl,
  isSubmitting = false,
}: FirstTakeModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);
  const { preferences } = useUserPreferences();
  const [rating, setRating] = useState<number>(5);
  const [quoteText, setQuoteText] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [visibility, setVisibility] = useState<ReviewVisibility>(preferences?.reviewVisibility ?? 'public');

  // Sync visibility default when preferences load
  useEffect(() => {
    if (preferences?.reviewVisibility) {
      setVisibility(preferences.reviewVisibility);
    }
  }, [preferences?.reviewVisibility]);

  const canSubmit = rating > 0 && quoteText.trim().length > 0 && !isSubmitting;
  const charCount = quoteText.length;
  const isNearLimit = charCount > 120;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    hapticImpact();

    await onSubmit({
      rating,
      quoteText: quoteText.trim(),
      isSpoiler,
      visibility,
    });

    Toast.show({
      type: 'success',
      text1: 'First Take posted!',
      visibilityTime: 2000,
    });
    hapticNotification(NotificationFeedbackType.Success);
    // Reset state after successful submit
    setRating(5);
    setQuoteText('');
    setIsSpoiler(false);
    setVisibility(preferences?.reviewVisibility ?? 'public');
  };

  const handleClose = () => {
    hapticImpact();
    // Reset state on close
    setRating(5);
    setQuoteText('');
    setIsSpoiler(false);
    setVisibility(preferences?.reviewVisibility ?? 'public');
    onClose();
  };

  // Format rating display (show decimal only when needed)
  const formatRating = (value: number) => {
    return value % 1 === 0 ? value.toString() : value.toFixed(1);
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
        style={styles.keyboardView}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <View style={styles.container}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Pressable style={styles.content} onPress={() => Keyboard.dismiss()}>
              {/* Header */}
              <View style={styles.header}>
                {moviePosterUrl && (
                  <Image
                    source={{ uri: moviePosterUrl }}
                    style={styles.poster}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.headerText}>
                  <Text style={styles.movieTitle} numberOfLines={2}>
                    {movieTitle}
                  </Text>
                  <Text style={styles.subtitle}>Your First Take</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.closeButton,
                    pressed && styles.closeButtonPressed,
                  ]}
                  onPress={handleClose}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </View>

              {/* Rating Section */}
              <View style={styles.ratingSection}>
                <Text style={styles.sectionLabel}>Rating</Text>

                <View style={styles.ratingWrapper}>
                  {/* Large Rating Display */}
                  <View style={styles.ratingDisplay}>
                    <Text style={styles.ratingValue}>{formatRating(rating)}</Text>
                    <Text style={styles.ratingMax}>/ 10</Text>
                  </View>

                  {/* Rating Slider */}
                  <View style={styles.sliderContainer}>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={10}
                      step={0.1}
                      value={rating}
                      onValueChange={(value) => setRating(Math.max(1, value))}
                      minimumTrackTintColor={colors.tint}
                      maximumTrackTintColor={colors.backgroundSecondary}
                      thumbTintColor="#ffffff"
                    />
                  </View>

                  {/* Rating Labels */}
                  <View style={styles.ratingLabels}>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelLeft]}>Poor</Text>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelCenter]}>Average</Text>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelRight]}>Masterpiece</Text>
                  </View>
                </View>
              </View>

              {/* Text Input Section */}
              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>Your Thoughts</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="What did you think? No spoilers unless you toggle below..."
                    placeholderTextColor={colors.textTertiary}
                    value={quoteText}
                    onChangeText={(text) => setQuoteText(text.slice(0, MAX_QUOTE_LENGTH))}
                    multiline
                    maxLength={MAX_QUOTE_LENGTH}
                    textAlignVertical="top"
                  />
                  <Text style={[styles.charCounter, isNearLimit && styles.charCounterWarning]}>
                    {charCount}/{MAX_QUOTE_LENGTH}
                  </Text>
                </View>
              </View>

              {/* Spoiler Toggle */}
              <View style={styles.spoilerRow}>
                <View style={styles.spoilerLeft}>
                  {/* Warning Icon */}
                  <View style={styles.warningIcon}>
                    <Text style={styles.warningIconText}>⚠</Text>
                  </View>
                  <View style={styles.spoilerTextContainer}>
                    <Text style={styles.spoilerTitle}>Contains Spoilers</Text>
                    <Text style={styles.spoilerSubtitle}>Content hidden until tapped</Text>
                  </View>
                </View>
                <ToggleSwitch
                  value={isSpoiler}
                  onValueChange={setIsSpoiler}
                  activeColor={colors.tint}
                />
              </View>

              {/* Visibility Selector */}
              <View style={styles.visibilitySection}>
                <Text style={styles.sectionLabel}>Visibility</Text>
                <View style={styles.visibilityRow}>
                  {VISIBILITY_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.visibilityPill,
                        visibility === option.value && styles.visibilityPillActive,
                      ]}
                      onPress={() => {
                        hapticImpact();
                        setVisibility(option.value);
                      }}
                    >
                      <Text
                        style={[
                          styles.visibilityPillText,
                          visibility === option.value && styles.visibilityPillTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  !canSubmit && styles.submitButtonDisabled,
                  pressed && canSubmit && styles.submitButtonPressed,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
                    Post First Take
                  </Text>
                )}
              </Pressable>
            </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    keyboardView: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: 34, // Safe area
      maxHeight: '90%',
    },
    content: {
      padding: Spacing.lg,
    },

    // Header Styles
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.lg,
    },
    poster: {
      width: 60,
      height: 90,
      borderRadius: BorderRadius.sm,
      ...Shadows.md,
    },
    headerText: {
      flex: 1,
    },
    movieTitle: {
      ...Typography.body.lg,
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeButtonPressed: {
      opacity: 0.8,
    },
    closeButtonText: {
      color: colors.textSecondary,
      fontSize: 16,
    },

    // Section Label
    sectionLabel: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Spacing.sm,
      fontFamily: Fonts.inter.semibold,
    },

    // Rating Section
    ratingSection: {
      marginBottom: Spacing.lg,
    },
    ratingWrapper: {
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
    },
    ratingDisplay: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    ratingValue: {
      fontFamily: Fonts.outfit.extrabold,
      fontSize: 48,
      color: colors.tint,
      lineHeight: 52,
    },
    ratingMax: {
      fontFamily: Fonts.outfit.semibold,
      fontSize: 20,
      color: colors.textTertiary,
    },
    sliderContainer: {
      width: '100%',
      height: 32,
      justifyContent: 'center',
    },
    slider: {
      width: '100%',
      height: 32,
    },
    ratingLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: -Spacing.xs,
      // Match the slider's internal padding (iOS ~16px, Android ~0)
      paddingHorizontal: Platform.OS === 'ios' ? 16 : 0,
    },
    ratingLabelText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: Fonts.inter.semibold,
      flex: 1,
    },
    ratingLabelLeft: {
      textAlign: 'left',
    },
    ratingLabelCenter: {
      textAlign: 'center',
    },
    ratingLabelRight: {
      textAlign: 'right',
    },

    // Text Input Section
    inputSection: {
      marginBottom: Spacing.lg,
    },
    inputWrapper: {
      position: 'relative',
    },
    textArea: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      paddingBottom: Spacing.xl, // Space for character counter
      color: colors.text,
      ...Typography.body.sm,
      height: 120,
      textAlignVertical: 'top',
    },
    charCounter: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    charCounterWarning: {
      color: colors.tint,
    },

    // Spoiler Toggle
    spoilerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundSecondary,
      padding: 12,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.lg,
    },
    spoilerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    warningIcon: {
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    warningIconText: {
      fontSize: 18,
      color: colors.gold, // Amber color for warning
    },
    spoilerTextContainer: {
      gap: 2,
    },
    spoilerTitle: {
      ...Typography.body.sm,
      color: colors.text,
      fontFamily: Fonts.inter.medium,
    },
    spoilerSubtitle: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },

    // Visibility Selector
    visibilitySection: {
      marginBottom: Spacing.lg,
    },
    visibilityRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    visibilityPill: {
      flex: 1,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    visibilityPillActive: {
      backgroundColor: colors.tint,
      borderColor: colors.tint,
    },
    visibilityPillText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      fontFamily: Fonts.inter.medium,
    },
    visibilityPillTextActive: {
      color: '#ffffff',
    },

    // Submit Button
    submitButton: {
      width: '100%',
      backgroundColor: colors.tint,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: colors.tint,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    submitButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    submitButtonDisabled: {
      backgroundColor: colors.border,
      ...Platform.select({
        ios: {
          shadowOpacity: 0,
        },
        android: {
          elevation: 0,
        },
      }),
    },
    submitButtonText: {
      ...Typography.button.primary,
      color: '#ffffff',
    },
    submitButtonTextDisabled: {
      color: colors.textSecondary,
    },
  });
