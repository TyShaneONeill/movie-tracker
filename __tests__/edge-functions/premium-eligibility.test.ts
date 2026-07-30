import {
  isPremiumTier,
  filterRemindersToPremium,
  type ProfileTier,
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
