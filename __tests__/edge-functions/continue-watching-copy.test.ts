import {
  buildContinueWatchingBody,
  buildContinueWatchingPayloads,
  selectNextUnwatchedEpisode,
  passesCaps,
  passesGate,
  type ContinueWatchingCandidate,
  type EpisodeCatalogEntry,
  type PriorNudge,
} from '../../supabase/functions/send-continue-watching-nudges/continue-watching-copy';

const candidate = (
  over: Partial<ContinueWatchingCandidate> = {}
): ContinueWatchingCandidate => ({
  user_id: 'u1',
  tmdb_id: 2316,
  season_number: 2,
  episode_number: 5,
  show_name: 'The Office',
  episode_name: 'Halloween',
  ...over,
});

describe('buildContinueWatchingBody', () => {
  it('produces a warm, on-brand line naming the show and SxEy label', () => {
    const body = buildContinueWatchingBody(candidate());
    expect(body).toContain('The Office');
    expect(body).toContain('S2E5');
  });

  it('is deterministic for a given (show, season, episode)', () => {
    expect(buildContinueWatchingBody(candidate())).toBe(
      buildContinueWatchingBody(candidate())
    );
  });

  it('varies copy across different episodes of the same show', () => {
    const bodies = new Set(
      [1, 2, 3, 4].map((episode_number) =>
        buildContinueWatchingBody(candidate({ episode_number }))
      )
    );
    // At least two distinct variants across four episodes (not a single fixed string).
    expect(bodies.size).toBeGreaterThan(1);
  });
});

describe('buildContinueWatchingPayloads', () => {
  it('returns empty array for empty input', () => {
    expect(buildContinueWatchingPayloads([])).toEqual([]);
  });

  it('builds one payload per candidate with the /tv/{id} deep link and room-upgrade fields', () => {
    const payloads = buildContinueWatchingPayloads([candidate()]);
    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.user_ids).toEqual(['u1']);
    expect(p.feature).toBe('continue_watching');
    expect(p.channel_id).toBe('reminders');
    // /tv/{id} so old bundles resolve; client upgrades to the room via the
    // season/episode fields when episode_rooms is on.
    expect(p.data.url).toBe('/tv/2316');
    expect(p.data.tmdb_id).toBe(2316);
    expect(p.data.season).toBe(2);
    expect(p.data.episode).toBe(5);
    expect(p.data.feature).toBe('continue_watching');
  });
});

describe('selectNextUnwatchedEpisode', () => {
  const catalog: EpisodeCatalogEntry[] = [
    { season: 2, episode: 4, airDate: '2020-01-01' },
    { season: 2, episode: 5, airDate: '2020-01-08' },
    { season: 2, episode: 6, airDate: '2099-01-01' }, // future
    { season: 3, episode: 1, airDate: '2020-06-01' },
  ];
  const today = '2026-07-21';

  it('picks the same-season next aired episode', () => {
    expect(selectNextUnwatchedEpisode(2, 4, catalog, today)).toEqual({
      season: 2,
      episode: 5,
    });
  });

  it('returns null (caught up) when the same-season next episode exists but has not aired', () => {
    // Watched E5 → next is E6, which airs in 2099.
    expect(selectNextUnwatchedEpisode(2, 5, catalog, today)).toBeNull();
  });

  it('crosses the season boundary to S+1E1 only when the next same-season episode is absent from the catalog', () => {
    // Watched S2E6 (the last episode the season carries) → cross to S3E1.
    expect(selectNextUnwatchedEpisode(2, 6, catalog, today)).toEqual({
      season: 3,
      episode: 1,
    });
  });

  it('does not cross the boundary when the premiere has not aired', () => {
    const noAiredPremiere: EpisodeCatalogEntry[] = [
      { season: 1, episode: 1, airDate: '2020-01-01' },
      { season: 2, episode: 1, airDate: '2099-01-01' },
    ];
    expect(selectNextUnwatchedEpisode(1, 1, noAiredPremiere, today)).toBeNull();
  });

  it('excludes specials from the chain (last-watched season < 1 → null)', () => {
    expect(selectNextUnwatchedEpisode(0, 1, catalog, today)).toBeNull();
  });

  it('respects the local "today" boundary for aired checks', () => {
    const c: EpisodeCatalogEntry[] = [
      { season: 1, episode: 1, airDate: '2026-07-20' },
      { season: 1, episode: 2, airDate: '2026-07-21' },
    ];
    // Episode airing exactly today counts as aired.
    expect(selectNextUnwatchedEpisode(1, 1, c, '2026-07-21')).toEqual({
      season: 1,
      episode: 2,
    });
    // One day earlier, it hasn't aired yet.
    expect(selectNextUnwatchedEpisode(1, 1, c, '2026-07-20')).toBeNull();
  });
});

describe('passesCaps', () => {
  const now = new Date('2026-07-21T18:00:00Z');
  const target = { season: 2, episode: 5 };

  it('allows a nudge when there is no prior history', () => {
    expect(passesCaps([], target, now)).toBe(true);
  });

  it('blocks a second nudge within the same day (once-a-day cap)', () => {
    const prior: PriorNudge[] = [
      { season: 9, episode: 9, status: 'sent', sentAt: '2026-07-21T10:00:00Z' },
    ];
    // A continue_watching push already went out ~8h ago today → blocked.
    expect(passesCaps(prior, target, now)).toBe(false);
  });

  it('counts delivered (not only sent) toward the once-a-day cap (terminal-success set)', () => {
    const prior: PriorNudge[] = [
      { season: 9, episode: 9, status: 'delivered', sentAt: '2026-07-21T10:00:00Z' },
    ];
    expect(passesCaps(prior, target, now)).toBe(false);
  });

  it('ignores failed sends for the once-a-day cap (a transient failure must not burn the day)', () => {
    const prior: PriorNudge[] = [
      { season: 9, episode: 9, status: 'failed', sentAt: '2026-07-21T10:00:00Z' },
    ];
    expect(passesCaps(prior, target, now)).toBe(true);
  });

  it('blocks after 2 terminal-success strikes on the same episode', () => {
    const prior: PriorNudge[] = [
      { season: 2, episode: 5, status: 'sent', sentAt: '2026-07-19T18:00:00Z' },
      { season: 2, episode: 5, status: 'delivered', sentAt: '2026-07-20T18:00:00Z' },
    ];
    expect(passesCaps(prior, target, now)).toBe(false);
  });

  it('allows a nudge after 1 strike on the same episode (outside the daily window)', () => {
    const prior: PriorNudge[] = [
      { season: 2, episode: 5, status: 'sent', sentAt: '2026-07-19T18:00:00Z' },
    ];
    expect(passesCaps(prior, target, now)).toBe(true);
  });

  it('does not count strikes on a different episode toward the 2-strike cap', () => {
    const prior: PriorNudge[] = [
      { season: 2, episode: 4, status: 'sent', sentAt: '2026-07-18T18:00:00Z' },
      { season: 2, episode: 4, status: 'delivered', sentAt: '2026-07-19T18:00:00Z' },
    ];
    // Two strikes exist, but on E4 — E5 is still fair game (and no send today).
    expect(passesCaps(prior, target, now)).toBe(true);
  });
});

describe('passesGate', () => {
  it('allows a founder with no preference row (absent = enabled)', () => {
    expect(
      passesGate({ email: 'tyshaneoneill@gmail.com', preferenceEnabled: null })
    ).toBe(true);
  });

  it('allows a founder with an explicit enabled=true row', () => {
    expect(
      passesGate({ email: 'g@g.g', preferenceEnabled: true })
    ).toBe(true);
  });

  it('blocks a founder who explicitly opted out (enabled=false)', () => {
    expect(
      passesGate({ email: 'tyoneill97@gmail.com', preferenceEnabled: false })
    ).toBe(false);
  });

  it('blocks a non-founder even with the preference enabled', () => {
    expect(
      passesGate({ email: 'someone@else.com', preferenceEnabled: true })
    ).toBe(false);
  });

  it('is case-insensitive on the allowlist match', () => {
    expect(
      passesGate({ email: 'TyShaneONeill@Gmail.com', preferenceEnabled: undefined })
    ).toBe(true);
  });

  it('blocks when there is no email', () => {
    expect(passesGate({ email: null, preferenceEnabled: null })).toBe(false);
  });
});
