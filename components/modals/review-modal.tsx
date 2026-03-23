/**
 * Review Modal Component
 * Slide-up modal for logging a movie with review
 * Reference: ui-mocks/review_modal.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StarRating } from '@/components/ui/star-rating';
import { ToggleSwitch } from '@/components/ui/toggle-switch';

interface ReviewModalProps {
  /**
   * Whether the modal is visible
   */
  visible: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Callback when review is saved
   */
  onSave: (review: ReviewData) => void;

  /**
   * Movie data to display in the modal
   */
  movie: {
    id: string;
    title: string;
    year: string;
    posterUrl: string;
  };
}

interface ReviewData {
  rating: number;
  watchedDate: string;
  reviewText: string;
  containsSpoilers: boolean;
}

/**
 * ReviewModal component for logging movies with ratings and reviews
 *
 * Features:
 * - Slide-up modal animation from bottom
 * - Movie mini header (poster + title + year)
 * - Interactive 5-star rating
 * - Watched date picker (currently shows "Today, Dec 27" - placeholder)
 * - Review textarea
 * - Contains Spoilers toggle switch
 * - Cancel and Save buttons
 * - Backdrop blur effect
 *
 * @example
 * <ReviewModal
 *   visible={isVisible}
 *   onClose={() => setIsVisible(false)}
 *   onSave={(review) => console.log(review)}
 *   movie={{ id: '1', title: 'Dune: Part Two', year: '2024', posterUrl: '...' }}
 * />
 */
export function ReviewModal({
  visible,
  onClose,
  onSave,
  movie,
}: ReviewModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [containsSpoilers, setContainsSpoilers] = useState(false);

  const handleSave = () => {
    hapticImpact();
    const reviewData: ReviewData = {
      rating,
      watchedDate: new Date().toISOString(), // Placeholder
      reviewText,
      containsSpoilers,
    };
    onSave(reviewData);
    hapticNotification(NotificationFeedbackType.Success);
    handleClose();
  };

  const handleClose = () => {
    hapticImpact();
    // Reset form
    setRating(0);
    setReviewText('');
    setContainsSpoilers(false);
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
        style={{ flex: 1 }}
      >
      {/* Backdrop */}
      <Pressable
        style={styles.overlay}
        onPress={handleClose}
      >
        {/* Modal Content - prevent backdrop press from closing when tapping inside */}
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Header: Cancel | Title | Save */}
            <View style={styles.header}>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={[Typography.body.base, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>

              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
                Log Movie
              </Text>

              <Pressable
                onPress={handleSave}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={[Typography.body.base, { color: colors.tint, fontWeight: '600' }]}>
                  Save
                </Text>
              </Pressable>
            </View>

            {/* Movie Mini Header */}
            <View style={styles.movieHeader}>
              <Image
                source={{ uri: movie.posterUrl }}
                style={styles.poster}
              />
              <View>
                <Text style={[Typography.body.lg, { color: colors.text, marginBottom: 4 }]}>
                  {movie.title}
                </Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
                  {movie.year}
                </Text>
              </View>
            </View>

            {/* Rating Section */}
            <Text style={[Typography.body.sm, styles.ratingLabel, { color: colors.textSecondary }]}>
              Tap to Rate
            </Text>
            <View style={styles.ratingContainer}>
              <StarRating
                rating={rating}
                onRatingChange={setRating}
                size={32}
              />
            </View>

            {/* Watched Date Picker */}
            <View style={[styles.datePicker, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[Typography.body.base, { color: colors.textSecondary }]}>
                Watched on
              </Text>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
                Today, Dec 27
              </Text>
            </View>

            {/* Review Textarea */}
            <TextInput
              style={[
                styles.reviewInput,
                {
                  backgroundColor: colors.backgroundSecondary,
                  color: colors.text,
                  borderColor: colors.border,
                },
                Typography.body.base,
              ]}
              placeholder="Add a review..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              value={reviewText}
              onChangeText={setReviewText}
              textAlignVertical="top"
            />

            {/* Contains Spoilers Toggle */}
            <View style={[styles.spoilersRow, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
                Contains Spoilers
              </Text>
              <ToggleSwitch
                value={containsSpoilers}
                onValueChange={setContainsSpoilers}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  movieHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BorderRadius.sm,
  },
  ratingLabel: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  ratingContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  datePicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  reviewInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    minHeight: 100,
    borderWidth: 1,
  },
  spoilersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
