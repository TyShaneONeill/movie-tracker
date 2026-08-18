/**
 * PS-15 streak screen render contracts: the message card says the right thing
 * per state, the extend pills appear only while today is blank (and route where
 * their mono sub-labels say they do), and the flag-off path renders nothing.
 *
 * The SVG camera is deliberately not snapshotted — its geometry is the mock's
 * job, checked by screenshot, not by a serialized tree that would break on any
 * innocuous refactor.
 */

import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import StreakScreen from '@/app/streak';
import { useStreakSpineEnabled } from '@/hooks/use-feature-flag';
import { useStreakCard } from '@/hooks/use-streak-card';
import type { StreakCard } from '@/lib/streak-service';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useStreakSpineEnabled: jest.fn(() => true),
}));

jest.mock('@/hooks/use-streak-card', () => ({
  useStreakCard: jest.fn(),
}));

const mockFlag = useStreakSpineEnabled as jest.Mock;
const mockCard = useStreakCard as jest.Mock;

const TODAY = '2026-08-15';

function card(over: {
  streak: number;
  extendedToday: boolean;
  longest?: number;
  rainChecks?: number;
  rainChecksUsed?: number;
}): StreakCard {
  const days: string[] = [];
  const last = over.extendedToday ? TODAY : '2026-08-14';
  for (let i = 0; i < Math.min(over.streak, 14); i++) {
    days.push(new Date(Date.UTC(2026, 7, Number(last.slice(8)) - i)).toISOString().slice(0, 10));
  }
  return {
    snapshot: {
      currentStreak: over.streak,
      longestStreak: over.longest ?? over.streak,
      lastActivityDate: over.streak > 0 ? last : null,
      rainChecks: over.rainChecks ?? 1,
      rainChecksUsed: over.rainChecksUsed ?? 0,
      lastEarnDate: null,
    },
    activityDays: days.map((d) => ({ local_date: d, first_action: 'log', action_count: 1 })),
    localDate: TODAY,
    windowStart: '2026-08-01',
    alive: over.streak > 0,
    effectiveStreak: over.streak,
  };
}

function mount(over: Parameters<typeof card>[0]) {
  mockCard.mockReturnValue({ enabled: true, card: card(over), loaded: true });
  return render(<StreakScreen />);
}

describe('StreakScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag.mockReturnValue(true);
  });

  describe('message card', () => {
    it('reads the idle line when today is still blank', () => {
      const { getByText } = mount({ streak: 12, extendedToday: false });
      expect(getByText('No scene shot today.')).toBeTruthy();
      expect(getByText(/One take keeps the reel alive\./)).toBeTruthy();
    });

    it('reads the active line once today is in the can', () => {
      const { getByText } = mount({ streak: 12, extendedToday: true });
      expect(getByText('Day 12, in the can.')).toBeTruthy();
      expect(getByText(/The camera keeps rolling\./)).toBeTruthy();
    });

    it('reads the milestone line on a banked threshold', () => {
      const { getByText } = mount({ streak: 30, extendedToday: true });
      expect(getByText('Day 30, that’s a wrap on a full month.')).toBeTruthy();
      expect(getByText(/Saved to your reel\./)).toBeTruthy();
      expect(getByText('MILESTONE')).toBeTruthy();
    });

    it('reads the day-0 line for a user with nothing on the reel', () => {
      const { getByText } = mount({ streak: 0, extendedToday: false });
      expect(getByText('Thread the projector.')).toBeTruthy();
      expect(getByText(/log anything today and the first frame prints\./)).toBeTruthy();
    });
  });

  describe('extend pills', () => {
    it('offers scan / first take / comment while today is blank', () => {
      const { getByText } = mount({ streak: 12, extendedToday: false });
      expect(getByText('Scan ticket')).toBeTruthy();
      expect(getByText('First Take')).toBeTruthy();
      expect(getByText('Comment')).toBeTruthy();
    });

    it('leads with rating a film for a day-0 user', () => {
      const { getByText, queryByText } = mount({ streak: 0, extendedToday: false });
      expect(getByText('Rate a film')).toBeTruthy();
      expect(queryByText('Comment')).toBeNull();
    });

    it('disappears once today is logged — there is nothing left to extend', () => {
      const { queryByText } = mount({ streak: 12, extendedToday: true });
      expect(queryByText('Scan ticket')).toBeNull();
      expect(queryByText('First Take')).toBeNull();
    });

    it('dismisses the screen and lands where its sub-label says', () => {
      const { getByText } = mount({ streak: 12, extendedToday: false });
      fireEvent.press(getByText('Scan ticket'));
      expect(router.back).toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith('/(tabs)/scanner');
    });
  });

  describe('chrome', () => {
    it('shows the month, the stat chips, and the FRIENDS tab as inert', () => {
      const { getByText } = mount({ streak: 12, extendedToday: true, rainChecks: 1 });
      expect(getByText('August 2026')).toBeTruthy();
      expect(getByText('DAYS ACTIVE')).toBeTruthy();
      expect(getByText('RAIN CHECK BANKED')).toBeTruthy();
      expect(getByText('FRIENDS')).toBeTruthy();
      expect(getByText('SOON')).toBeTruthy();
    });

    it('switches the second chip to checks spent once any have been', () => {
      const { getByText, queryByText } = mount({
        streak: 12,
        extendedToday: true,
        rainChecksUsed: 2,
      });
      expect(getByText('RAIN CHECKS USED')).toBeTruthy();
      expect(queryByText('RAIN CHECK BANKED')).toBeNull();
    });
  });

  it('renders nothing and bounces home when streak_spine is off', () => {
    mockFlag.mockReturnValue(false);
    mockCard.mockReturnValue({ enabled: false, card: null, loaded: false });

    const { queryByText } = render(<StreakScreen />);
    expect(queryByText('Streak')).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
