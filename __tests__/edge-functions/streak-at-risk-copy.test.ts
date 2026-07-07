import {
  buildStreakAtRiskPayloads,
  type StreakAtRiskCandidate,
} from '../../supabase/functions/send-streak-at-risk/streak-at-risk-copy';

describe('buildStreakAtRiskPayloads', () => {
  it('returns empty array for empty input', () => {
    expect(buildStreakAtRiskPayloads([])).toEqual([]);
  });

  it('builds one payload per user (per-user send isolation)', () => {
    const candidates: StreakAtRiskCandidate[] = [
      { user_id: 'u1', current_streak: 4, rain_check_pending: false },
      { user_id: 'u2', current_streak: 9, rain_check_pending: true },
    ];
    const payloads = buildStreakAtRiskPayloads(candidates);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].user_ids).toEqual(['u1']);
    expect(payloads[1].user_ids).toEqual(['u2']);
  });

  it('carries feature + streak metadata for delivery/analytics', () => {
    const [payload] = buildStreakAtRiskPayloads([
      { user_id: 'u1', current_streak: 7, rain_check_pending: false },
    ]);
    expect(payload.feature).toBe('streak_at_risk');
    expect(payload.data.feature).toBe('streak_at_risk');
    expect(payload.data.current_streak).toBe(7);
    expect(payload.data.rain_check_pending).toBe(false);
    expect(payload.channel_id).toBe('default');
    expect(payload.body).toContain('Day 7');
  });

  it('references the rain check when one will be spent', () => {
    const [payload] = buildStreakAtRiskPayloads([
      { user_id: 'u1', current_streak: 12, rain_check_pending: true },
    ]);
    expect(payload.body).toContain('Day 12');
    expect(payload.body.toLowerCase()).toContain('rain check');
  });
});
