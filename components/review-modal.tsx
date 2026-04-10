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

const MAX_REVIEW_TEXT_LENGTH = 2000;
const MAX_TITLE_LENGTH = 100;

const VISIBILITY_OPTIONS: { value: ReviewVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'followers_only', label: 'Followers' },
  { value: 'private', label: 'Private' },
];

interface ReviewSubmitData {
  rating: number;
  title: string;
  reviewText: string;
  isSpoiler: boolean;
  visibility: ReviewVisibility;
}

interface ExistingReviewData {
  rating: number;
  title: string;
  reviewText: string;
  isSpoiler: boolean;
  visibility: ReviewVisibility;
}

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: ReviewSubmitData) => Promise<void>;
  movieTitle: string;
  moviePosterUrl?: string;
  initialRating?: number;
  existingReview?: ExistingReviewData | null;
  isSubmitting?: boolean;
}

export function ReviewModal({
  visible,
  onClose,
  onSubmit,
  movieTitle,
  moviePosterUrl,
  initialRating,
  existingReview,
  isSubmitting = false,
}: ReviewModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);
  const { preferences } = useUserPreferences();

  const [rating, setRating] = useState<number>(existingReview?.rating ?? initialRating ?? 5);
  const [title, setTitle] = useState(existingReview?.title ?? '');
  const [reviewText, setReviewText] = useState(existingReview?.reviewText ?? '');
  const [isSpoiler, setIsSpoiler] = useState(existingReview?.isSpoiler ?? false);
  const [visibility, setVisibility] = useState<ReviewVisibility>(
    existingReview?.visibility ?? preferences?.reviewVisibility ?? 'public'
  );

  // Reset form when modal opens with new data
  useEffect(() => {
    if (visible) {
      setRating(existingReview?.rating ?? initialRating ?? 5);
      setTitle(existingReview?.title ?? '');
      setReviewText(existingReview?.reviewText ?? '');
      setIsSpoiler(existingReview?.isSpoiler ?? false);
      setVisibility(existingReview?.visibility ?? preferences?.reviewVisibility ?? 'public');
    }
  }, [visible, existingReview, initialRating, preferences?.reviewVisibility]);

  const canSubmit = rating > 0 && reviewText.trim().length > 0 && title.trim().length > 0 && !isSubmitting;
  const charCount = reviewText.length;
  const isNearLimit = charCount > MAX_REVIEW_TEXT_LENGTH - 200;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    hapticImpact();

    await onSubmit({
      rating,
      title: title.trim(),
      reviewText: reviewText.trim(),
      isSpoiler,
      visibility,
    });

    Toast.show({
      type: 'success',
      text1: existingReview ? 'Review updated!' : 'Review posted!',
      visibilityTime: 2000,
    });
    hapticNotification(NotificationFeedbackType.Success);
  };

  const handleClose = () => {
    hapticImpact();
    onClose();
  };

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
              <Pressable style={styles.content} onPress={Platform.OS === 'web' ? undefined : () => Keyboard.dismiss()}>
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
                  <Text style={styles.subtitle}>Your Review</Text>
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
                  <View style={styles.ratingDisplay}>
                    <Text style={styles.ratingValue}>{formatRating(rating)}</Text>
                    <Text style={styles.ratingMax}>/ 10</Text>
                  </View>

                  <View style={styles.sliderContainer}>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={10}
                      step={0.1}
                      value={rating}
                      onValueChange={(value) => setRating(Math.round(value * 10) / 10)}
                      minimumTrackTintColor={colors.tint}
                      maximumTrackTintColor={colors.backgroundSecondary}
                      thumbTintColor="#ffffff"
                    />
                  </View>

                  <View style={styles.ratingLabels}>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelLeft]}>Poor</Text>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelCenter]}>Average</Text>
                    <Text style={[styles.ratingLabelText, styles.ratingLabelRight]}>Masterpiece</Text>
                  </View>
                </View>
              </View>

              {/* Title */}
              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>Title</Text>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Give your review a title..."
                  placeholderTextColor={colors.textTertiary}
                  value={title}
                  onChangeText={(text) => setTitle(text.slice(0, MAX_TITLE_LENGTH))}
                  maxLength={MAX_TITLE_LENGTH}
                />
              </View>

              {/* Review Text */}
              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>Your Review</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Write your detailed review..."
                    placeholderTextColor={colors.textTertiary}
                    value={reviewText}
                    onChangeText={(text) => setReviewText(text.slice(0, MAX_REVIEW_TEXT_LENGTH))}
                    multiline
                    maxLength={MAX_REVIEW_TEXT_LENGTH}
                    textAlignVertical="top"
                  />
                  <Text style={[styles.charCounter, isNearLimit && styles.charCounterWarning]}>
                    {charCount}/{MAX_REVIEW_TEXT_LENGTH}
                  </Text>
                </View>
              </View>

              {/* Spoiler Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.toggleIcon}>
                    <Text style={styles.toggleIconText}>⚠</Text>
                  </View>
                  <View style={styles.toggleTextContainer}>
                    <Text style={styles.toggleTitle}>Contains Spoilers</Text>
                    <Text style={styles.toggleSubtitle}>Content hidden until tapped</Text>
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
                    {existingReview ? 'Update Review' : 'Post Review'}
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
      paddingBottom: 34,
      maxHeight: '90%',
      ...(Platform.OS === 'web' ? { maxWidth: 768, width: '100%', alignSelf: 'center' as const } : {}),
    },
    content: {
      padding: Spacing.lg,
    },

    // Header
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

    // Rating
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

    // Title Input
    titleInput: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      color: colors.text,
      ...Typography.body.sm,
    },

    // Text Input
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
      paddingBottom: Spacing.xl,
      color: colors.text,
      ...Typography.body.sm,
      height: 200,
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

    // Toggle Rows
    toggleRow: {
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
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    toggleIcon: {
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toggleIconText: {
      fontSize: 18,
      color: colors.gold,
    },
    toggleTextContainer: {
      gap: 2,
    },
    toggleTitle: {
      ...Typography.body.sm,
      color: colors.text,
      fontFamily: Fonts.inter.medium,
    },
    toggleSubtitle: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },

    // Visibility
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

    // Submit
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
