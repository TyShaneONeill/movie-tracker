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

import { StreakProvider, useStreak } from '@/lib/streak-context';
import * as streakService from '@/lib/streak-service';

// The real celebration pulls in theme-context/reanimated/haptics — irrelevant
// here, where the only question is whether the RPC is reached.
jest.mock('@/components/achievement-celebration', () => ({
  AchievementCelebration: () => null,
}));

jest.mock('@/lib/streak-service', () => ({
  recordUserActivity: jest.fn(),
  streakSpineEnabledNow: jest.fn(),
}));

const recordUserActivityMock = streakService.recordUserActivity as jest.Mock;
const streakSpineEnabledNowMock = streakService.streakSpineEnabledNow as jest.Mock;

function TestHarness() {
  const { recordActivity } = useStreak();
  return (
    <Pressable testID="act" onPress={() => recordActivity('like')}>
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

    await waitFor(() => expect(recordUserActivityMock).toHaveBeenCalledWith('like'));
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
      first_action: 'like',
      milestone: null,
      rain_check_consumed: false,
      rain_check_earned: false,
    });

    function VersionProbe() {
      const { recordActivity, streakVersion } = useStreak();
      return (
        <Pressable testID="act" onPress={() => recordActivity('like')}>
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
