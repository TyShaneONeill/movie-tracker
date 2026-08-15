import {
  buildContinueWatchingCopy,
  buildContinueWatchingPayloads,
  selectContinueWatchingVariant,
  CONTINUE_WATCHING_VARIANTS,
  selectNextUnwatchedEpisode,
  passesCaps,
  passesGate,
  type ContinueWatchingCandidate,
  type EpisodeCatalogEntry,
  type PriorNudge,
} from '../../supabase/functions/send-continue-watching-nudges/continue-watching-copy';

const DAY = '2026-08-15';

const candidate = (
  over: Partial<ContinueWatchingCandidate> = {}
): ContinueWatchingCandidate => ({
  user_id: 'u1',
  tmdb_id: 2316,
  season_number: 2,
  episode_number: 5,
  show_name: 'The Office',
  episode_name: 'Halloween',
  local_today: DAY,
  ...over,
});

describe('buildContinueWatchingCopy', () => {
  it('identifies the episode from the BODY ALONE, in every variant', () => {
    // The strong form of the rule. A long show name truncates in the
    // notification shade, and the title is where that bites first — so no
    // variant may put the only identifying text there. Body carries both the
    // show and the SxEy label, always.
    for (const variant of CONTINUE_WATCHING_VARIANTS) {
      const { body } = variant.render('The Office', 'S2E5');
      expect(body).toContain('The Office');
      expect(body).toContain('S2E5');
    }
  });

  it('keeps every title short and free of the show name, so nothing truncates away', () => {
    for (const variant of CONTINUE_WATCHING_VARIANTS) {
      const { title } = variant.render(
        'The Lord of the Rings: The Rings of Power',
        'S2E5'
      );
      expect(title).not.toContain('The Lord of the Rings');
      expect(title.length).toBeLessThanOrEqual(30);
    }
  });

  it('leaks nothing about the user beyond the show and the episode label', () => {
    const c = candidate();
    const { title, body } = buildContinueWatchingCopy(c);
    const line = `${title} ${body}`;
    // The episode TITLE would spoil, and the user id is not copy.
    expect(line).not.toContain(c.episode_name!);
    expect(line).not.toContain(c.user_id);
  });

  it('is deterministic for a given (user, local day)', () => {
    expect(buildContinueWatchingCopy(candidate())).toEqual(
      buildContinueWatchingCopy(candidate())
    );
  });

  it('does not repeat the same variant on consecutive days', () => {
    // The rotation steps by exactly one variant per day, so a back-to-back
    // repeat is impossible — this is why the index is offset+day, not a plain
    // hash of the day.
    const days = [
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ];
    const variants = days.map(
      (d) => buildContinueWatchingCopy(candidate({ local_today: d })).variant
    );
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i]).not.toBe(variants[i - 1]);
    }
  });

  it('does not repeat across a spring-forward DST boundary (America/Denver, Mar 7-8 2026)', () => {
    // The case the UTC-keyed rotation got wrong. Denver springs forward on
    // 2026-03-08: the 17:00-local send lands at 2026-03-08T00:00Z on the 7th
    // (MST, UTC-7) and 2026-03-08T23:00Z on the 8th (MDT, UTC-6) — ONE UTC date
    // covering two consecutive local evenings, so a UTC-keyed rotation would
    // hand this user the identical message two nights running. Keyed on
    // local_today, the two evenings are 03-07 and 03-08 and the rotation steps.
    const mar7 = buildContinueWatchingCopy(
      candidate({ local_today: '2026-03-07' })
    );
    const mar8 = buildContinueWatchingCopy(
      candidate({ local_today: '2026-03-08' })
    );
    expect(mar7.variant).not.toBe(mar8.variant);
    expect(mar7.body).not.toBe(mar8.body);

    // Both evenings share a UTC date, which is what made the old key unsafe.
    expect(new Date('2026-03-08T00:00:00Z').toISOString().slice(0, 10)).toBe(
      new Date('2026-03-08T23:00:00Z').toISOString().slice(0, 10)
    );
  });

  it('does not repeat for a UTC-6 user whose evenings straddle midnight UTC', () => {
    // 17:00 local in UTC-6 is 23:00Z one evening and 00:00Z the next once the
    // clock or the offset shifts; local_today keeps them distinct regardless.
    const first = buildContinueWatchingCopy(
      candidate({ local_today: '2026-06-30' })
    );
    const second = buildContinueWatchingCopy(
      candidate({ local_today: '2026-07-01' })
    );
    expect(first.variant).not.toBe(second.variant);
  });

  it('walks the whole pool over N consecutive days', () => {
    const n = CONTINUE_WATCHING_VARIANTS.length;
    const start = Date.parse(`${DAY}T00:00:00Z`);
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      seen.add(buildContinueWatchingCopy(candidate({ local_today: day })).variant);
    }
    expect(seen.size).toBe(n);
  });

  it('gives different users different starting variants on the same day', () => {
    const variants = new Set(
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(
        (user_id) => selectContinueWatchingVariant(user_id, DAY).id
      )
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('carries a pool of at least 8 variants with unique ids', () => {
    expect(CONTINUE_WATCHING_VARIANTS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(CONTINUE_WATCHING_VARIANTS.map((v) => v.id));
    expect(ids.size).toBe(CONTINUE_WATCHING_VARIANTS.length);
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

  it('stamps the copy variant into data so opens are attributable per line', () => {
    const [p] = buildContinueWatchingPayloads([candidate()]);
    const copy = buildContinueWatchingCopy(candidate());
    expect(p.data.variant).toBe(copy.variant);
    expect(p.title).toBe(copy.title);
    expect(p.body).toBe(copy.body);
  });

  it('rotates each user on their OWN local date, not one server-wide date', () => {
    // Two users nudged in the same cron tick can be on different calendar days
    // (17:00 in Auckland vs 17:00 in Denver). Each payload must follow its own
    // candidate's local_today.
    const [ahead, behind] = buildContinueWatchingPayloads([
      candidate({ user_id: 'u1', local_today: '2026-08-16' }),
      candidate({ user_id: 'u1', local_today: '2026-08-15' }),
    ]);
    expect(ahead.data.variant).not.toBe(behind.data.variant);
  });

  it('gives two users nudged the same evening their own rotation', () => {
    const payloads = buildContinueWatchingPayloads([
      candidate({ user_id: 'u1' }),
      candidate({ user_id: 'u2' }),
    ]);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].data.variant).not.toBe(payloads[1].data.variant);
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
  it('allows a user with no preference row (absent = enabled)', () => {
    expect(passesGate({ preferenceEnabled: null })).toBe(true);
    expect(passesGate({ preferenceEnabled: undefined })).toBe(true);
  });

  it('allows a user with an explicit enabled=true row', () => {
    expect(passesGate({ preferenceEnabled: true })).toBe(true);
  });

  it('blocks a user who explicitly opted out (enabled=false)', () => {
    expect(passesGate({ preferenceEnabled: false })).toBe(false);
  });

  it('no longer gates on a founder allowlist (widened 2026-08-15)', () => {
    // Any user with the preference on qualifies; the SQL dropped the
    // auth.users email allowlist, so this mirror must not reintroduce one.
    expect(passesGate({ preferenceEnabled: true })).toBe(true);
  });
});
