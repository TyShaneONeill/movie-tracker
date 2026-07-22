import {
  getNotificationPreference,
  setNotificationPreference,
  NOTIFICATION_FEATURE_DEFAULTS,
} from '@/lib/notification-preferences-service';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const getUserMock = supabase.auth.getUser as jest.Mock;
const fromMock = supabase.from as jest.Mock;

function mockSelectChain(maybeSingleResult: { data: any; error: any }) {
  const builder: any = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  fromMock.mockReturnValue(builder);
  return builder;
}

function mockUpsertChain(upsertResult: { error: any }) {
  const builder: any = {};
  builder.upsert = jest.fn().mockResolvedValue(upsertResult);
  fromMock.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('NOTIFICATION_FEATURE_DEFAULTS', () => {
  it('defaults the informational features to enabled (absent-row = enabled), streak_at_risk to opt-in OFF', () => {
    expect(NOTIFICATION_FEATURE_DEFAULTS).toEqual({
      release_reminders: true,
      tv_episode_reminders: true,
      day2_bridge: true,
      weekly_recap: true,
      // PS-15 PR 3: loss-framed evening nudge is opt-in; opt-in is also enforced
      // server-side in get_streak_at_risk_candidates (explicit enabled=true row).
      streak_at_risk: false,
      // Continue-watching retention experiment: opt-out (default ON). Opt-out is
      // enforced server-side in get_continue_watching_nudge_candidates.
      continue_watching_nudges: true,
    });
  });
});

describe('getNotificationPreference', () => {
  it('returns null when no row exists (no preference set)', async () => {
    mockSelectChain({ data: null, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(null);
  });

  it('returns true when the row says enabled=true', async () => {
    mockSelectChain({ data: { enabled: true }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(true);
  });

  it('returns false when the row says enabled=false', async () => {
    mockSelectChain({ data: { enabled: false }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(false);
  });

  it('returns null when user is unauthenticated (graceful)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(null);
  });
});

describe('setNotificationPreference', () => {
  it('upserts the preference with onConflict on user_id+feature', async () => {
    const builder = mockUpsertChain({ error: null });
    await setNotificationPreference('release_reminders', false);
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        feature: 'release_reminders',
        enabled: false,
        updated_at: expect.any(String),
      }),
      { onConflict: 'user_id,feature' }
    );
  });

  it('throws when not authenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      setNotificationPreference('release_reminders', true)
    ).rejects.toThrow('Not authenticated');
  });

  it('throws when supabase returns an error', async () => {
    mockUpsertChain({ error: { message: 'boom' } });
    await expect(
      setNotificationPreference('release_reminders', true)
    ).rejects.toMatchObject({ message: 'boom' });
  });
});
