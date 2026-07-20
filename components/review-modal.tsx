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
import { RatingSlider } from '@/components/ui/rating-slider';
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
  /**
   * PS-12: when true the review's CONTENT is locked (grace window closed or it
   * has engagement). Content inputs (rating/title/text/spoiler) become
   * read-only while visibility stays editable so the owner can still change who
   * sees it. Content is sent unchanged on Save, so the DB trigger accepts it.
   */
  contentLocked?: boolean;
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
  contentLocked = false,
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

  // When content is locked the user can still save a visibility-only change, so
  // the button stays enabled regardless of the (read-only) content values.
  const canSubmit =
    (contentLocked || (rating > 0 && reviewText.trim().length > 0 && title.trim().length > 0)) &&
    !isSubmitting;
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

              {/* Content-locked note — visibility stays editable */}
              {contentLocked && (
                <View style={styles.lockNote}>
                  <Text style={styles.lockNoteText}>
                    Editing is locked — you can still change who sees this.
                  </Text>
                </View>
              )}

              {/* Rating Section — shared 1–10 slider (also used by the TV Time deck) */}
              <View style={[styles.ratingSection, contentLocked && styles.lockedField]}>
                <Text style={styles.sectionLabel}>Rating</Text>
                <RatingSlider value={rating} onChange={setRating} step={1} disabled={contentLocked} />
              </View>

              {/* Title */}
              <View style={[styles.inputSection, contentLocked && styles.lockedField]}>
                <Text style={styles.sectionLabel}>Title</Text>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Give your review a title..."
                  placeholderTextColor={colors.textTertiary}
                  value={title}
                  onChangeText={(text) => setTitle(text.slice(0, MAX_TITLE_LENGTH))}
                  editable={!contentLocked}
                  maxLength={MAX_TITLE_LENGTH}
                />
              </View>

              {/* Review Text */}
              <View style={[styles.inputSection, contentLocked && styles.lockedField]}>
                <Text style={styles.sectionLabel}>Your Review</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Write your detailed review..."
                    placeholderTextColor={colors.textTertiary}
                    value={reviewText}
                    onChangeText={(text) => setReviewText(text.slice(0, MAX_REVIEW_TEXT_LENGTH))}
                    editable={!contentLocked}
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
              <View style={[styles.toggleRow, contentLocked && styles.lockedField]}>
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
                  disabled={contentLocked}
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

    // Content-lock note + dimmed read-only fields
    lockNote: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    lockNoteText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    lockedField: {
      opacity: 0.5,
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

    // Rating (the slider itself lives in the shared RatingSlider component)
    ratingSection: {
      marginBottom: Spacing.lg,
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
