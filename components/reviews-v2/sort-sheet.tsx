/**
 * ReviewSortSheet — the "Order the programme" sheet (contract note B).
 *
 * A thin adapter over the app's existing `ActionSheet`: the four sort options
 * with their one-line descriptors, a ✓ on the current selection, and the
 * selection echoed back to the caller (which updates the trigger label). No new
 * dependency, no segmented slab.
 */

import { ActionSheet } from '@/components/ui/action-sheet';
import type { ReviewSortOption } from '@/hooks/use-user-reviews';

interface ReviewSortSheetProps {
  visible: boolean;
  current: ReviewSortOption;
  onClose: () => void;
  onSelect: (sort: ReviewSortOption) => void;
}

/** Label + one-line descriptor per option, in the mock's order. */
export const SORT_OPTIONS: { key: ReviewSortOption; label: string; description: string }[] = [
  { key: 'recent', label: 'Recent', description: 'newest first' },
  { key: 'popular', label: 'Popular', description: 'most liked' },
  { key: 'highest', label: 'Highest', description: 'your best-rated' },
  { key: 'lowest', label: 'Lowest', description: 'the ones that hurt' },
];

/** The uppercase trigger label for a given sort ("RECENT", "LOWEST", …). */
export function sortTriggerLabel(sort: ReviewSortOption): string {
  const opt = SORT_OPTIONS.find((o) => o.key === sort);
  return (opt?.label ?? 'Recent').toUpperCase();
}

export function ReviewSortSheet({ visible, current, onClose, onSelect }: ReviewSortSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Order the programme"
      options={SORT_OPTIONS.map((opt) => ({
        label: opt.label,
        description: opt.description,
        selected: opt.key === current,
        onPress: () => onSelect(opt.key),
      }))}
    />
  );
}
