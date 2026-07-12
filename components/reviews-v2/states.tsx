/**
 * States — empty / skeleton / error for the Reviews v2 tab (contract note F).
 *
 * Skeleton and error reuse the First Takes v2 state components (one system);
 * the error passes reviews-specific copy. Empty is the dashed blank shelf with
 * reviews copy — own profile gets a "Write a review" CTA routing to search;
 * another user's empty carries no CTA.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { FirstTakesSkeleton, FirstTakesError } from '@/components/first-takes-v2/states';

// Skeleton is copy-free — reuse the First Takes shimmer rows verbatim.
export { FirstTakesSkeleton as ReviewsSkeleton };

/** Error with reviews copy, reusing the First Takes error shell. */
export function ReviewsError({ onRetry }: { onRetry: () => void }) {
  return <FirstTakesError onRetry={onRetry} message="We couldn't load these reviews." />;
}

/** A dashed blank shelf. Own profile gets the writerly copy + CTA to search. */
export function ReviewsEmpty({
  isOwn,
  onWriteReview,
}: {
  isOwn: boolean;
  onWriteReview?: () => void;
}) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';

  return (
    <View style={[styles.empty, { borderColor: dashColor }]}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No reviews yet</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        {isOwn
          ? 'A review is the programme note — the considered write-up. Write one from any movie page.'
          : 'This user hasn’t written any reviews.'}
      </Text>
      {isOwn && onWriteReview && (
        <Pressable
          onPress={onWriteReview}
          accessibilityRole="button"
          accessibilityLabel="Write a review"
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>Write a review</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 16,
  },
  cta: {
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
