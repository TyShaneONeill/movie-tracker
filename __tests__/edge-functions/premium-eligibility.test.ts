import {
  isPremiumTier,
  filterRemindersToPremium,
  chunkIds,
  resolveTiers,
  TIER_LOOKUP_CHUNK_SIZE,
  type ProfileTier,
  type TierRow,
} from '../../supabase/functions/send-release-reminders/premium-eligibility';

const NOW = new Date('2026-07-29T12:00:00Z');

describe('isPremiumTier', () => {
  it('blocks free', () => {
    expect(isPremiumTier({ account_tier: 'free' }, NOW)).toBe(false);
  });

  it('allows premium (the value the profiles check constraint stores)', () => {
    expect(isPremiumTier({ account_tier: 'premium' }, NOW)).toBe(true);
  });

  it("allows plus (the client-side PremiumTier alias)", () => {
    expect(isPremiumTier({ account_tier: 'plus' }, NOW)).toBe(true);
  });

  it('allows dev', () => {
    expect(isPremiumTier({ account_tier: 'dev' }, NOW)).toBe(true);
  });

  it('blocks a missing profile row', () => {
    expect(isPremiumTier(undefined, NOW)).toBe(false);
  });

  it('blocks null / absent account_tier', () => {
    expect(isPremiumTier({ account_tier: null }, NOW)).toBe(false);
    expect(isPremiumTier({}, NOW)).toBe(false);
  });

  it('blocks an unrecognized tier rather than defaulting open', () => {
    expect(isPremiumTier({ account_tier: 'legacy_gold' }, NOW)).toBe(false);
  });

  it('allows premium with a future expiry', () => {
    expect(
      isPremiumTier(
        { account_tier: 'premium', tier_expires_at: '2026-08-29T12:00:00Z' },
        NOW
      )
    ).toBe(true);
  });

  it('blocks premium whose expiry has passed — the DB sweep only runs when the user opens the app, so a churned subscriber would otherwise keep receiving a paid notification', () => {
    expect(
      isPremiumTier(
        { account_tier: 'premium', tier_expires_at: '2026-07-01T12:00:00Z' },
        NOW
      )
    ).toBe(false);
  });

  it('allows premium with no expiry recorded', () => {
    expect(isPremiumTier({ account_tier: 'premium', tier_expires_at: null }, NOW)).toBe(true);
  });

  it('ignores expiry for dev accounts', () => {
    expect(
      isPremiumTier(
        { account_tier: 'dev', tier_expires_at: '2020-01-01T00:00:00Z' },
        NOW
      )
    ).toBe(true);
  });

  it('keeps a paying member when the expiry timestamp is unparseable', () => {
    expect(
      isPremiumTier({ account_tier: 'premium', tier_expires_at: 'not-a-date' }, NOW)
    ).toBe(true);
  });
});

describe('filterRemindersToPremium', () => {
  const reminders = [
    { user_id: 'free-user', tmdb_id: 1 },
    { user_id: 'plus-user', tmdb_id: 1 },
    { user_id: 'dev-user', tmdb_id: 2 },
    { user_id: 'lapsed-user', tmdb_id: 2 },
    { user_id: 'unknown-user', tmdb_id: 3 },
  ];

  const tiers = new Map<string, ProfileTier>([
    ['free-user', { account_tier: 'free' }],
    ['plus-user', { account_tier: 'premium' }],
    ['dev-user', { account_tier: 'dev' }],
    ['lapsed-user', { account_tier: 'premium', tier_expires_at: '2026-07-01T00:00:00Z' }],
  ]);

  it('keeps only recipients with an active premium tier', () => {
    const kept = filterRemindersToPremium(reminders, tiers, NOW);
    expect(kept.map((r) => r.user_id)).toEqual(['plus-user', 'dev-user']);
  });

  it('drops a user with no profile row (fails closed)', () => {
    const kept = filterRemindersToPremium(reminders, tiers, NOW);
    expect(kept.some((r) => r.user_id === 'unknown-user')).toBe(false);
  });

  it('returns everything when every recipient is entitled', () => {
    const allPlus = [{ user_id: 'plus-user', tmdb_id: 9 }];
    expect(filterRemindersToPremium(allPlus, tiers, NOW)).toHaveLength(1);
  });

  it('returns nothing when no recipient is entitled', () => {
    const allFree = [
      { user_id: 'free-user', tmdb_id: 9 },
      { user_id: 'unknown-user', tmdb_id: 9 },
    ];
    expect(filterRemindersToPremium(allFree, tiers, NOW)).toEqual([]);
  });

  it('preserves multiple reminders for the same entitled user', () => {
    const two = [
      { user_id: 'plus-user', tmdb_id: 1 },
      { user_id: 'plus-user', tmdb_id: 2 },
    ];
    expect(filterRemindersToPremium(two, tiers, NOW)).toHaveLength(2);
  });
});

describe('chunkIds', () => {
  it('splits into chunks of at most the given size', () => {
    expect(chunkIds(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('returns a single chunk when the input fits', () => {
    expect(chunkIds(['a', 'b'], 200)).toEqual([['a', 'b']]);
  });

  it('returns no chunks for an empty input', () => {
    expect(chunkIds([], 200)).toEqual([]);
  });

  it('defaults to the exported chunk size', () => {
    const ids = Array.from({ length: TIER_LOOKUP_CHUNK_SIZE + 1 }, (_, i) => `u${i}`);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(TIER_LOOKUP_CHUNK_SIZE);
    expect(chunks[1]).toEqual([`u${TIER_LOOKUP_CHUNK_SIZE}`]);
  });

  it('rejects a nonsense size instead of looping forever', () => {
    expect(() => chunkIds(['a'], 0)).toThrow(/size must be >= 1/);
  });
});

describe('resolveTiers', () => {
  const row = (id: string, account_tier: string): TierRow => ({ id, account_tier });

  it('chunks the lookup instead of sending one unbounded request', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `u${i}`);
    const seen: string[][] = [];
    const { tierByUserId, failedChunks, unresolved } = await resolveTiers(
      ids,
      async (chunk) => {
        seen.push(chunk);
        return { data: chunk.map((id) => row(id, 'premium')), error: null };
      },
      { chunkSize: 2 }
    );

    expect(seen).toEqual([['u0', 'u1'], ['u2', 'u3'], ['u4']]);
    expect(tierByUserId.size).toBe(5);
    expect(failedChunks).toBe(0);
    expect(unresolved).toBe(0);
  });

  it('logs and continues past a failing chunk, keeping the chunks that worked', async () => {
    const onChunkError = jest.fn();
    const { tierByUserId, failedChunks, unresolved } = await resolveTiers(
      ['a', 'b', 'c', 'd'],
      async (chunk) =>
        chunk.includes('a')
          ? { data: null, error: { message: 'URL too long' } }
          : { data: chunk.map((id) => row(id, 'premium')), error: null },
      { chunkSize: 2, onChunkError }
    );

    // The surviving chunk still resolves — the whole tick is not lost.
    expect([...tierByUserId.keys()]).toEqual(['c', 'd']);
    expect(failedChunks).toBe(1);
    expect(unresolved).toBe(2);
    expect(onChunkError).toHaveBeenCalledTimes(1);
    expect(onChunkError).toHaveBeenCalledWith({ message: 'URL too long' }, ['a', 'b']);
  });

  it('users in a failed chunk fail closed — a premium member is dropped, never sent to by default', async () => {
    const { tierByUserId } = await resolveTiers(
      ['lost-member', 'ok-member'],
      async (chunk) =>
        chunk[0] === 'lost-member'
          ? { data: null, error: new Error('boom') }
          : { data: [row('ok-member', 'premium')], error: null },
      { chunkSize: 1 }
    );

    const kept = filterRemindersToPremium(
      [{ user_id: 'lost-member' }, { user_id: 'ok-member' }],
      tierByUserId,
      NOW
    );
    expect(kept.map((r) => r.user_id)).toEqual(['ok-member']);
  });

  it('treats a thrown request the same as an error payload', async () => {
    const onChunkError = jest.fn();
    const { tierByUserId, failedChunks } = await resolveTiers(
      ['a'],
      async () => {
        throw new Error('network down');
      },
      { onChunkError }
    );
    expect(tierByUserId.size).toBe(0);
    expect(failedChunks).toBe(1);
    expect(onChunkError).toHaveBeenCalledTimes(1);
  });

  it('counts genuinely absent rows as unresolved without calling it a failure', async () => {
    const { tierByUserId, failedChunks, unresolved } = await resolveTiers(
      ['has-row', 'no-row'],
      async () => ({ data: [row('has-row', 'free')], error: null })
    );
    expect(tierByUserId.size).toBe(1);
    expect(failedChunks).toBe(0);
    expect(unresolved).toBe(1);
  });

  it('does not double-count duplicate ids in unresolved', async () => {
    const { unresolved } = await resolveTiers(
      ['dup', 'dup'],
      async () => ({ data: [row('dup', 'premium')], error: null })
    );
    expect(unresolved).toBe(0);
  });

  it('skips malformed rows that carry no id', async () => {
    const { tierByUserId } = await resolveTiers(
      ['a'],
      async () => ({
        data: [{ account_tier: 'premium' } as TierRow, row('a', 'premium')],
        error: null,
      })
    );
    expect([...tierByUserId.keys()]).toEqual(['a']);
  });

  it('makes no requests for an empty id list', async () => {
    const fetchChunk = jest.fn();
    const { tierByUserId, unresolved } = await resolveTiers([], fetchChunk);
    expect(fetchChunk).not.toHaveBeenCalled();
    expect(tierByUserId.size).toBe(0);
    expect(unresolved).toBe(0);
  });
});
