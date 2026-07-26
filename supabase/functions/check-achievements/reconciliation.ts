/**
 * Pure helper for check-achievements: decides which already-earned
 * achievement levels no longer hold given the user's CURRENT stats (e.g.
 * after bulk-marking a show watched then un-checking seasons/episodes).
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it
 * directly, and is also Jest-testable via relative path from
 * __tests__/edge-functions/ (mirrors build-reminder-payload.ts).
 *
 * SAFETY: a criteria_type is only ever considered for revocation when its
 * stat snapshot is explicitly marked `available: true`. A failed, timed
 * out, or otherwise unavailable stat query must be excluded here, never
 * coerced to a value of 0 — that would revoke every level the user holds
 * for that criteria_type. See index.ts for how availability is derived
 * from each Supabase query's `error`/`data`/`count` fields.
 */

export interface EarnedLevelRow {
  achievement_id: string;
  level: number;
}

export interface AchievementCriteria {
  id: string;
  criteria_type: string;
}

export interface LevelCriteria {
  achievement_id: string;
  level: number;
  criteria_value: number;
}

export interface StatSnapshot {
  value: number;
  available: boolean;
}

/**
 * Returns the earned (achievement_id, level) rows that no longer satisfy
 * their level's criteria_value under the current stats. A row is left
 * untouched (never revoked) if:
 *  - its achievement's criteria_type has no stat snapshot this run, or
 *    that snapshot is marked unavailable (query error/timeout upstream)
 *  - its level definition can't be found (don't guess at criteria_value)
 * Naturally idempotent: re-running against an unchanged stats snapshot
 * recomputes the same revoke set from the rows still present.
 */
export function computeRevocations(
  earnedRows: EarnedLevelRow[],
  achievements: AchievementCriteria[],
  levelsByAchievement: Map<string, LevelCriteria[]>,
  stats: Record<string, StatSnapshot>
): EarnedLevelRow[] {
  const criteriaTypeById = new Map(achievements.map(a => [a.id, a.criteria_type]));
  const toRevoke: EarnedLevelRow[] = [];

  for (const row of earnedRows) {
    const criteriaType = criteriaTypeById.get(row.achievement_id);
    if (!criteriaType) continue; // unknown achievement — leave alone

    const stat = stats[criteriaType];
    if (!stat || !stat.available) continue; // not evaluated this run — never revoke

    const levelDef = levelsByAchievement
      .get(row.achievement_id)
      ?.find(l => l.level === row.level);
    if (!levelDef) continue; // level definition missing — leave alone, don't guess

    if (stat.value < levelDef.criteria_value) {
      toRevoke.push({ achievement_id: row.achievement_id, level: row.level });
    }
  }

  return toRevoke;
}
