/**
 * ReviewsTab — the redesigned Reviews profile tab (design contract "Reviews
 * Tab — Proposal 01").
 *
 * "One ledger line, then the programme." The two legacy chrome rows (sort
 * segment + media toggles) collapse into ONE control line: scope chips (left,
 * only when the user has both media types — same rule as First Takes v2) and a
 * quiet "RECENT ⌄" sort trigger (right) that opens the app's existing
 * ActionSheet. Each review renders as a light-touch programme note; flat
 * perforations separate them.
 *
 * Shared by BOTH profile screens (own + user/[id]); the caller supplies the
 * fetched reviews, load/error state, and navigation/delete callbacks. Sort
 * resets to Recent per visit (Decision 2) — the tab unmounts on tab switch, so
 * the default state naturally resets. Data source is unchanged from the legacy
 * tab.
 */

import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { Review } from '@/lib/database.types';
import type { ReviewSortOption } from '@/hooks/use-user-reviews';
import {
  type ReviewScope,
  reviewScopeCounts,
  shouldShowReviewScopeChips,
  filterReviewsByScope,
  sortReviews,
} from '@/lib/reviews-v2-logic';
import { FirstTakesScopeChips } from '@/components/first-takes-v2/scope-chips';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { ReviewProgrammeCard } from './review-programme-card';
import { ReviewSortSheet, sortTriggerLabel } from './sort-sheet';
import { ReviewsSkeleton, ReviewsError, ReviewsEmpty } from './states';

interface ReviewsTabProps {
  reviews: Review[];
  loading: boolean;
  error: boolean;
  /** True on the signed-in user's own profile — unlocks delete + the CTA. */
  isOwn: boolean;
  onRetry: () => void;
  onPressReview: (id: string) => void;
  /** Own profile only — routes to search to write a review (empty-state CTA). */
  onWriteReview?: () => void;
  /** Own profile only — deletes a review by id. */
  onDeleteReview?: (id: string) => void;
}

export function ReviewsTab({
  reviews,
  loading,
  error,
  isOwn,
  onRetry,
  onPressReview,
  onWriteReview,
  onDeleteReview,
}: ReviewsTabProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [scope, setScope] = useState<ReviewScope>('all');
  const [sort, setSort] = useState<ReviewSortOption>('recent');
  const [sheetVisible, setSheetVisible] = useState(false);

  const counts = useMemo(() => reviewScopeCounts(reviews), [reviews]);
  const showScope = useMemo(() => shouldShowReviewScopeChips(reviews), [reviews]);
  const visible = useMemo(
    () => sortReviews(filterReviewsByScope(reviews, scope), sort),
    [reviews, scope, sort]
  );

  if (loading) return <View style={styles.wrap}><ReviewsSkeleton /></View>;
  if (error) return <View style={styles.wrap}><ReviewsError onRetry={onRetry} /></View>;
  if (reviews.length === 0) {
    return (
      <View style={styles.wrap}>
        <ReviewsEmpty isOwn={isOwn} onWriteReview={onWriteReview} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* THE control line — scope chips left, quiet sort trigger right. */}
      <View style={styles.controls}>
        {showScope && (
          <View style={styles.scopeWrap}>
            <FirstTakesScopeChips
              active={scope}
              counts={counts}
              onChange={setScope}
              noun="reviews"
            />
          </View>
        )}
        <Pressable
          style={styles.sortTrigger}
          onPress={() => setSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort order, ${sortTriggerLabel(sort)}`}
        >
          <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>
            {sortTriggerLabel(sort)}
          </Text>
          <Ionicons name="chevron-down" size={11} color={colors.textSecondary} />
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <Text style={[styles.filterEmpty, { color: colors.textSecondary }]}>
          No reviews match this filter
        </Text>
      ) : (
        visible.map((review, index) => (
          // Keyed by review id: the programme card holds spoiler-reveal state,
          // so a different review sliding into this slot (scope/sort change or
          // refetch) must remount and start redacted (the #662 key-by-id rule).
          <View key={review.id}>
            {index > 0 && <Perforation />}
            <ReviewProgrammeCard
              review={review}
              onPress={() => onPressReview(review.id)}
              onDelete={onDeleteReview ? () => onDeleteReview(review.id) : undefined}
            />
          </View>
        ))
      )}

      <ReviewSortSheet
        visible={sheetVisible}
        current={sort}
        onClose={() => setSheetVisible(false)}
        onSelect={setSort}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Mirrors First Takes v2: the tab owns its 12pt inset so the parent wrapper
    // goes flush (see contentFlush) and the two don't double up.
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginHorizontal: 2,
    marginBottom: 6,
  },
  scopeWrap: {
    flexShrink: 1,
  },
  sortTrigger: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingLeft: 8,
  },
  sortLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  filterEmpty: {
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: 24,
  },
});
