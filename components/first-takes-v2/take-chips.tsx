/**
 * TakeChips — the real-state tags on a first take's fine-print footer
 * (contract note F). Every chip encodes actual row state, never decoration:
 *   • TV       — media_type is tv_show/tv_season/tv_episode
 *   • S{n} · E{n} — only when the episode columns are non-null (0 rows today;
 *                 renderer kept ready per Decision 4)
 *   • Rewatch  — is_rewatch (rose outline, the one accented chip)
 *   • Edited   — edited_at is set
 *
 * 9px uppercase, hairline outline; rose outline reserved for Rewatch.
 */

import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import type { FirstTake } from '@/lib/database.types';
import { isTvTake, formatSeasonEpisode } from '@/lib/first-takes-v2-logic';
import { Chip } from './chip';

interface TakeChipsProps {
  take: Pick<
    FirstTake,
    'media_type' | 'season_number' | 'episode_number' | 'is_rewatch' | 'edited_at'
  >;
}

export function TakeChips({ take }: TakeChipsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const seasonEpisode = formatSeasonEpisode(take);

  return (
    <>
      {isTvTake(take) && <Chip label="TV" color={colors.textSecondary} border={colors.border} />}
      {seasonEpisode && (
        <Chip label={seasonEpisode} color={colors.textSecondary} border={colors.border} />
      )}
      {take.is_rewatch && <Chip label="Rewatch" color={colors.tint} border={colors.tint} />}
      {take.edited_at && <Chip label="Edited" color={colors.textSecondary} border={colors.border} />}
    </>
  );
}
