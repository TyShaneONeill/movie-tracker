/**
 * StreakProvider's write gate. The provider mounts at the app root, before
 * PostHog's identify call delivers person-targeted flags, so WHEN the gate is
 * read decides whether anything is ever recorded: a gate sampled during the
 * provider's render latches false and silently drops every qualifying action
 * (#834). These tests pin the gate to call time.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { StreakProvider, useStreak } from '@/lib/streak-context';
import { StreakCelebrationTakeover } from '@/components/streak/streak-celebration-takeover';
import * as streakService from '@/lib/streak-service';

jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));

// The takeover's stage reaches theme-context for its palette, which drags in
// auth and expo-apple-authentication — untransformable here.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  hapticSelection: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

let mockUserId: string | null = 'user-a';
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}));

// The real celebration pulls in theme-context/reanimated/haptics — irrelevant
// here. Stubbed down to the one fact these tests ask of it: whether it is up.
jest.mock('@/components/achievement-celebration', () => {
  const { Text } = require('react-native');
  return {
    AchievementCelebration: ({ visible, achievement }: any) =>
      visible ? <Text testID="milestone-modal">{achievement?.name}</Text> : null,
  };
});

jest.mock('@/lib/streak-service', () => ({
  recordUserActivity: jest.fn(),
  streakSpineEnabledNow: jest.fn(),
}));

const recordUserActivityMock = streakService.recordUserActivity as jest.Mock;
const streakSpineEnabledNowMock = streakService.streakSpineEnabledNow as jest.Mock;

function TestHarness() {
  const { recordActivity } = useStreak();
  return (
    <Pressable testID="act" onPress={() => recordActivity('comment')}>
      <Text>act</Text>
    </Pressable>
  );
}

function renderProvider() {
  return render(
    <StreakProvider>
      <TestHarness />
    </StreakProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  recordUserActivityMock.mockResolvedValue(null);
  mockUserId = 'user-a';
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

describe('StreakProvider — streak_spine write gate', () => {
  it('records when the flag resolves AFTER mount (the race that dropped every action)', async () => {
    // PostHog has not answered while the provider renders...
    streakSpineEnabledNowMock.mockReturnValue(false);
    const { getByTestId } = renderProvider();

    // ...and answers before the user acts. A gate sampled at mount would have
    // latched the false above and dropped this action with no error anywhere.
    streakSpineEnabledNowMock.mockReturnValue(true);
    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalledWith('comment'));
  });

  it('no-ops when the flag is genuinely off at the moment the user acts', () => {
    streakSpineEnabledNowMock.mockReturnValue(false);
    const { getByTestId } = renderProvider();

    fireEvent.press(getByTestId('act'));

    expect(recordUserActivityMock).not.toHaveBeenCalled();
  });

  it('re-reads the gate on every call, so a flag that flips off stops writing', async () => {
    streakSpineEnabledNowMock.mockReturnValue(true);
    const { getByTestId } = renderProvider();

    fireEvent.press(getByTestId('act'));
    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalledTimes(1));

    streakSpineEnabledNowMock.mockReturnValue(false);
    fireEvent.press(getByTestId('act'));

    expect(recordUserActivityMock).toHaveBeenCalledTimes(1);
  });

  it('bumps streakVersion so the streak surfaces refetch after a recorded action', async () => {
    streakSpineEnabledNowMock.mockReturnValue(true);
    recordUserActivityMock.mockResolvedValue({
      current_streak: 4,
      longest_streak: 4,
      rain_checks: 0,
      rain_checks_used: 0,
      last_activity_date: '2026-08-19',
      local_date: '2026-08-19',
      first_action: 'comment',
      milestone: null,
      rain_check_consumed: false,
      rain_check_earned: false,
    });

    function VersionProbe() {
      const { recordActivity, streakVersion } = useStreak();
      return (
        <Pressable testID="act" onPress={() => recordActivity('comment')}>
          <Text testID="version">{String(streakVersion)}</Text>
        </Pressable>
      );
    }

    const { getByTestId } = render(
      <StreakProvider>
        <VersionProbe />
      </StreakProvider>
    );

    expect(getByTestId('version')).toHaveTextContent('0');
    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(getByTestId('version')).toHaveTextContent('1'));
  });
});

/**
 * The celebration takeover, and the order it shares the screen with the
 * milestone modal. The modal used to pop the instant the RPC answered, which
 * would now bury a running takeover.
 */
describe('StreakProvider — celebration handoff', () => {
  function rpc(over: Record<string, unknown> = {}) {
    return {
      current_streak: 13,
      previous_streak: 12,
      advanced: true,
      longest_streak: 13,
      rain_checks: 0,
      rain_checks_used: 0,
      last_activity_date: '2026-08-20',
      local_date: '2026-08-20',
      first_action: 'log',
      milestone: null,
      rain_check_consumed: false,
      rain_check_earned: false,
      ...over,
    };
  }

  /** Surfaces the pending celebration and lets a test dismiss it like the takeover would. */
  function CelebrationProbe() {
    const { recordActivity, pendingCelebration, dismissCelebration } = useStreak();
    return (
      <>
        <Pressable testID="act" onPress={() => recordActivity('log')}>
          <Text>act</Text>
        </Pressable>
        <Pressable testID="dismiss" onPress={dismissCelebration}>
          <Text testID="pending">
            {pendingCelebration
              ? `${pendingCelebration.from}->${pendingCelebration.to}`
              : 'none'}
          </Text>
        </Pressable>
        {/* The id increments per raise, so it catches a second takeover that
            replaced the first rather than stacking visibly beside it. */}
        <Text testID="celebration-id">{String(pendingCelebration?.id ?? 0)}</Text>
      </>
    );
  }

  /**
   * Plain queries on purpose. The provider marks nothing as hidden — that
   * marking lives in RootLayoutNav around the navigator only — so anything the
   * provider renders must stay reachable to a screen reader.
   */
  function mount() {
    return render(
      <StreakProvider>
        <CelebrationProbe />
      </StreakProvider>
    );
  }

  beforeEach(() => {
    streakSpineEnabledNowMock.mockReturnValue(true);
  });

  it('raises a takeover with the streak it rolled from and to', async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(getByTestId('pending')).toHaveTextContent('12->13'));
  });

  it('raises nothing on a same-day repeat', async () => {
    recordUserActivityMock.mockResolvedValue(
      rpc({ previous_streak: 13, advanced: false })
    );
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalled());
    expect(getByTestId('pending')).toHaveTextContent('none');
  });

  it('raises nothing when the streak reset', async () => {
    recordUserActivityMock.mockResolvedValue(rpc({ current_streak: 1 }));
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalled());
    expect(getByTestId('pending')).toHaveTextContent('none');
  });

  it('holds the milestone modal back until the takeover has cleared', async () => {
    recordUserActivityMock.mockResolvedValue(
      rpc({ previous_streak: 29, current_streak: 30, milestone: 30 })
    );
    const { getByTestId, queryByTestId } = mount();

    fireEvent.press(getByTestId('act'));
    await waitFor(() => expect(getByTestId('pending')).toHaveTextContent('29->30'));

    // The takeover is still playing — the modal must not be on top of it.
    expect(queryByTestId('milestone-modal')).toBeNull();

    fireEvent.press(getByTestId('dismiss'));

    await waitFor(() => expect(getByTestId('milestone-modal')).toBeTruthy());
    expect(getByTestId('milestone-modal')).toHaveTextContent('30-Day Streak');
    expect(getByTestId('pending')).toHaveTextContent('none');
  });

  /**
   * Every shipped client is on the remembered-baseline path until the
   * previous_streak migration deploys, so two actions landing together is a
   * live risk, not a theoretical one.
   */
  it('raises exactly one takeover when two qualifying actions land together', async () => {
    // A tiny in-memory store, so the second action reads what the first wrote.
    const store: Record<string, string> = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(store[k] ?? null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    });
    // Server truth absent — this is the fallback path the race lives on.
    recordUserActivityMock.mockResolvedValue(
      rpc({ previous_streak: undefined, advanced: undefined, current_streak: 13 })
    );
    // Seed the baseline the way a previous day's action would have.
    store['@streak_celebration_memory:user-a'] = JSON.stringify({
      lastStreak: 12,
      lastCelebratedDate: '2026-08-19',
    });

    const { getByTestId } = mount();
    fireEvent.press(getByTestId('act'));
    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(getByTestId('pending')).toHaveTextContent('12->13'));
    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalledTimes(2));
    // Still one, and still the first one — not re-raised by the second result.
    expect(getByTestId('pending')).toHaveTextContent('12->13');
    expect(getByTestId('celebration-id')).toHaveTextContent('1');
  });

  /**
   * REGRESSION (review round 2). The provider used to wrap `children` in a
   * no-hide-descendants View while a takeover was up — but the takeover mounts
   * inside RootLayoutNav, which IS part of `children`, so the marking hid the
   * takeover along with the app behind it: a full-screen touch blocker with no
   * announcement, no CTA and no skip target for TalkBack. Strictly worse than
   * not marking at all, and it escaped review because no test rendered the real
   * takeover inside the provider. This one does.
   *
   * The absence of `includeHiddenElements` below IS the assertion. The marking
   * now lives in RootLayoutNav, around the navigator only, with the takeover
   * kept outside it.
   */
  it('leaves the real takeover reachable to a screen reader', async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    const view = render(
      <StreakProvider>
        <CelebrationProbe />
        <StreakCelebrationTakeover />
      </StreakProvider>
    );

    fireEvent.press(view.getByTestId('act'));

    // No includeHiddenElements — a screen reader has to be able to find these.
    await waitFor(() => expect(view.getByLabelText('Keep it rolling')).toBeTruthy());
    expect(view.getByLabelText('Skip the streak celebration')).toBeTruthy();
    expect(view.getByText('day streak')).toBeTruthy();
  });

  it('keeps each account in its own namespace', async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() =>
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(
        '@streak_celebration_memory:user-a'
      )
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@streak_celebration_memory:user-a',
      expect.any(String)
    );
  });

  it("does not read the previous account's stamp after a user switch", async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    mockUserId = 'user-b';
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    const keysRead = (AsyncStorage.getItem as jest.Mock).mock.calls.map((c) => c[0]);
    expect(keysRead).toContain('@streak_celebration_memory:user-b');
    expect(keysRead).not.toContain('@streak_celebration_memory:user-a');
  });

  it('records nothing against storage for a signed-out session', async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    mockUserId = null;
    const { getByTestId } = mount();

    fireEvent.press(getByTestId('act'));

    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalled());
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(getByTestId('pending')).toHaveTextContent('none');
  });

  it('leaves no modal behind when the extension was not a milestone', async () => {
    recordUserActivityMock.mockResolvedValue(rpc());
    const { getByTestId, queryByTestId } = mount();

    fireEvent.press(getByTestId('act'));
    await waitFor(() => expect(getByTestId('pending')).toHaveTextContent('12->13'));
    fireEvent.press(getByTestId('dismiss'));

    await waitFor(() => expect(getByTestId('pending')).toHaveTextContent('none'));
    expect(queryByTestId('milestone-modal')).toBeNull();
  });
});
