import {
  buildDay2BridgePayloads,
  formatReleaseWhen,
  type Day2BridgeCandidate,
} from '../../supabase/functions/send-day2-bridge/day2-bridge-copy';

describe('formatReleaseWhen', () => {
  it('formats an ISO date as "Mon D" in UTC', () => {
    expect(formatReleaseWhen('2026-08-14')).toBe('Aug 14');
  });
});

describe('buildDay2BridgePayloads', () => {
  it('returns empty array for empty input', () => {
    expect(buildDay2BridgePayloads([])).toEqual([]);
  });

  it('builds a near_release payload with the movie title and formatted date', () => {
    const candidates: Day2BridgeCandidate[] = [
      {
        user_id: 'u1',
        has_watchlist: true,
        near_release: {
          tmdb_id: 42,
          title: 'Dune: Part Two',
          release_date: '2026-08-14',
          category: 'theatrical',
        },
      },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].data.variant).toBe('near_release');
    expect(result[0].data.tmdb_id).toBe(42);
    expect(result[0].data.url).toBe('/movie/42');
    expect(result[0].body).toBe(
      "«Dune: Part Two» hits theaters Aug 14 — it's on your watchlist."
    );
  });

  it('uses "streaming" venue wording for streaming category', () => {
    const candidates: Day2BridgeCandidate[] = [
      {
        user_id: 'u1',
        has_watchlist: true,
        near_release: {
          tmdb_id: 7,
          title: 'Some Series',
          release_date: '2026-08-01',
          category: 'streaming',
        },
      },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result[0].body).toContain('hits streaming');
  });

  it('builds a watchlist_anchored payload when there is a watchlist but no near release', () => {
    const candidates: Day2BridgeCandidate[] = [
      { user_id: 'u1', has_watchlist: true },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].data.variant).toBe('watchlist_anchored');
    expect(result[0].data.url).toBe('/watchlist');
    expect(result[0].data.tmdb_id).toBeUndefined();
  });

  it('builds a generic payload when there is no watchlist at all', () => {
    const candidates: Day2BridgeCandidate[] = [
      { user_id: 'u1', has_watchlist: false },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].data.variant).toBe('generic');
  });

  it('groups users sharing the same near-release movie into one payload', () => {
    const near = {
      tmdb_id: 42,
      title: 'Dune: Part Two',
      release_date: '2026-08-14',
      category: 'theatrical' as const,
    };
    const candidates: Day2BridgeCandidate[] = [
      { user_id: 'u1', has_watchlist: true, near_release: near },
      { user_id: 'u2', has_watchlist: true, near_release: near },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u1', 'u2']);
  });

  it('separates near-release users by distinct movie into distinct payloads', () => {
    const candidates: Day2BridgeCandidate[] = [
      {
        user_id: 'u1',
        has_watchlist: true,
        near_release: { tmdb_id: 1, title: 'A', release_date: '2026-08-01', category: 'theatrical' },
      },
      {
        user_id: 'u2',
        has_watchlist: true,
        near_release: { tmdb_id: 2, title: 'B', release_date: '2026-08-02', category: 'theatrical' },
      },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(2);
  });

  it('groups all watchlist_anchored and all generic users into exactly one payload each, across a mixed batch', () => {
    const candidates: Day2BridgeCandidate[] = [
      { user_id: 'u1', has_watchlist: true },
      { user_id: 'u2', has_watchlist: true },
      { user_id: 'u3', has_watchlist: false },
      { user_id: 'u4', has_watchlist: false },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result).toHaveLength(2);
    const anchored = result.find(p => p.data.variant === 'watchlist_anchored');
    const generic = result.find(p => p.data.variant === 'generic');
    expect(anchored?.user_ids).toEqual(['u1', 'u2']);
    expect(generic?.user_ids).toEqual(['u3', 'u4']);
  });

  it('sets feature=day2_bridge and channel_id=default on every payload', () => {
    const candidates: Day2BridgeCandidate[] = [
      { user_id: 'u1', has_watchlist: false },
    ];
    const result = buildDay2BridgePayloads(candidates);
    expect(result[0].feature).toBe('day2_bridge');
    expect(result[0].channel_id).toBe('default');
    expect(result[0].data.feature).toBe('day2_bridge');
  });
});
