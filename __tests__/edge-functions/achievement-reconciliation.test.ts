import {
  computeRevocations,
  type EarnedLevelRow,
  type AchievementCriteria,
  type LevelCriteria,
  type StatSnapshot,
} from '../../supabase/functions/check-achievements/reconciliation';

const achievements: AchievementCriteria[] = [
  { id: 'ach-tv-episodes', criteria_type: 'tv_episodes_count' },
  { id: 'ach-watched', criteria_type: 'watched_count' },
];

const levelsByAchievement = new Map<string, LevelCriteria[]>([
  [
    'ach-tv-episodes',
    [
      { achievement_id: 'ach-tv-episodes', level: 1, criteria_value: 10 },
      { achievement_id: 'ach-tv-episodes', level: 2, criteria_value: 50 },
      { achievement_id: 'ach-tv-episodes', level: 3, criteria_value: 100 },
    ],
  ],
  [
    'ach-watched',
    [
      { achievement_id: 'ach-watched', level: 1, criteria_value: 5 },
    ],
  ],
]);

describe('computeRevocations', () => {
  it('returns empty array when there are no earned rows', () => {
    expect(computeRevocations([], achievements, levelsByAchievement, {})).toEqual([]);
  });

  it('revokes a level whose criteria_value now exceeds the live (available) stat', () => {
    // User bulk-marked a show watched (earned levels 1 @ 10 and 2 @ 50
    // episodes), then un-checked most episodes — live count dropped to 15,
    // which still clears level 1 (10) but no longer clears level 2 (50).
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 1 },
      { achievement_id: 'ach-tv-episodes', level: 2 },
    ];
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 15, available: true },
    };

    const result = computeRevocations(earned, achievements, levelsByAchievement, stats);

    expect(result).toEqual([{ achievement_id: 'ach-tv-episodes', level: 2 }]);
  });

  it('never revokes when the stat for that criteria_type is unavailable (query error/timeout)', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 1 },
      { achievement_id: 'ach-tv-episodes', level: 2 },
      { achievement_id: 'ach-tv-episodes', level: 3 },
    ];
    // Naive reading of a failed query would be "stat = 0", which would
    // revoke every level here. available:false must suppress that entirely.
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 0, available: false },
    };

    const result = computeRevocations(earned, achievements, levelsByAchievement, stats);

    expect(result).toEqual([]);
  });

  it('never revokes a criteria_type with no stat snapshot at all this run', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-watched', level: 1 },
    ];
    // stats map doesn't even mention watched_count this run.
    const result = computeRevocations(earned, achievements, levelsByAchievement, {});

    expect(result).toEqual([]);
  });

  it('only reconciles the criteria_type actually evaluated, leaving others untouched', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 2 }, // should revoke (dropped to 8)
      { achievement_id: 'ach-watched', level: 1 },       // not evaluated this run
    ];
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 8, available: true },
      // watched_count intentionally omitted
    };

    const result = computeRevocations(earned, achievements, levelsByAchievement, stats);

    expect(result).toEqual([{ achievement_id: 'ach-tv-episodes', level: 2 }]);
  });

  it('does not revoke a level that still qualifies under the live stat', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 1 },
    ];
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 12, available: true },
    };

    expect(computeRevocations(earned, achievements, levelsByAchievement, stats)).toEqual([]);
  });

  it('leaves an earned row alone when its level definition is missing', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 99 }, // no such level defined
    ];
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 0, available: true },
    };

    expect(computeRevocations(earned, achievements, levelsByAchievement, stats)).toEqual([]);
  });

  it('is idempotent: running twice against the same stats yields the same result, and re-running after the revoke is applied is a no-op', () => {
    const earned: EarnedLevelRow[] = [
      { achievement_id: 'ach-tv-episodes', level: 1 },
      { achievement_id: 'ach-tv-episodes', level: 2 },
    ];
    const stats: Record<string, StatSnapshot> = {
      tv_episodes_count: { value: 8, available: true },
    };

    const first = computeRevocations(earned, achievements, levelsByAchievement, stats);
    const second = computeRevocations(earned, achievements, levelsByAchievement, stats);
    expect(second).toEqual(first);

    // Simulate the row having already been deleted by the first pass.
    const afterDelete = earned.filter(
      row => !first.some(r => r.achievement_id === row.achievement_id && r.level === row.level)
    );
    expect(computeRevocations(afterDelete, achievements, levelsByAchievement, stats)).toEqual([]);
  });
});
