/**
 * ReviewChips — the real-state tags on a review's fine-print footer
 * (contract note E). Every chip encodes actual row state, never decoration:
 *   • TV        — media_type is not `movie`
 *   • Rewatch   — is_rewatch (rose outline, the one accented chip)
 *   • Edited    — edited_at is set
 *   • Private / Followers — visibility, only when not public
 *
 * Renders with the shared 9px `Chip` primitive so First Takes and Reviews share
 * one chip system.
 */

import { useMemo } from 'react';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { Review } from '@/lib/database.types';
import { reviewChipFlags } from '@/lib/reviews-v2-logic';
import { Chip } from '@/components/first-takes-v2/chip';

interface ReviewChipsProps {
  review: Pick<Review, 'media_type' | 'is_rewatch' | 'edited_at' | 'visibility'>;
}

export function ReviewChips({ review }: ReviewChipsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const flags = useMemo(() => reviewChipFlags(review), [review]);

  return (
    <>
      {flags.tv && <Chip label="TV" color={colors.textSecondary} border={colors.border} />}
      {flags.rewatch && <Chip label="Rewatch" color={colors.tint} border={colors.tint} />}
      {flags.edited && <Chip label="Edited" color={colors.textSecondary} border={colors.border} />}
      {flags.visibility && (
        <Chip label={flags.visibility} color={colors.textSecondary} border={colors.border} />
      )}
    </>
  );
}
