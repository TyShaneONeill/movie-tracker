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
import { useStreakSpineGate } from '@/hooks/use-feature-flag';
import { useStreakCard } from '@/hooks/use-streak-card';
import type { StreakCard } from '@/lib/streak-service';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), getFeatureFlag: jest.fn(), onFeatureFlags: jest.fn(() => () => {}) },
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
  useStreakSpineGate: jest.fn(() => ({ enabled: true, resolved: true })),
}));

jest.mock('@/hooks/use-streak-card', () => ({
  useStreakCard: jest.fn(),
}));

const mockGate = useStreakSpineGate as jest.Mock;
const mockCard = useStreakCard as jest.Mock;

const TODAY = '2026-08-15';

function card(over: {
  streak: number;
  extendedToday: boolean;
  longest?: number;
  rainChecks?: number;
  rainChecksUsed?: number;
  alive?: boolean;
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
    alive: over.alive ?? over.streak > 0,
    effectiveStreak: over.streak,
  };
}

function mount(over: Parameters<typeof card>[0]) {
  mockCard.mockReturnValue({
    enabled: true,
    card: card(over),
    loaded: true,
    reload: jest.fn(),
  });
  return render(<StreakScreen />);
}

/**
 * The gradient ids of every numeral halo in the tree. The halo is geometry
 * rather than a shadow precisely so it renders the same on both platforms, so
 * its id is the one handle a unit test has on it — and deduping doubles as the
 * uniqueness check, since ids resolve across every mounted Svg root at once.
 */
function haloIds(tree: ReturnType<typeof mount>): string[] {
  type Node = { props: Record<string, unknown> };
  const ids: string[] = tree.UNSAFE_root
    .findAll((n: Node) => typeof n.props?.id === 'string' && n.props.id.startsWith('numHalo-'))
    .map((n: Node) => String(n.props.id));
  return [...new Set(ids)];
}

describe('StreakScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGate.mockReturnValue({ enabled: true, resolved: true });
    (router.canGoBack as jest.Mock).mockReturnValue(true);
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

  describe('the numeral bloom', () => {
    it('paints one warm halo behind a lit numeral', () => {
      expect(haloIds(mount({ streak: 12, extendedToday: true }))).toEqual(['numHalo-warm-dark']);
    });

    it('swaps it for the gold one at a milestone', () => {
      expect(haloIds(mount({ streak: 30, extendedToday: true }))).toEqual(['numHalo-mile-dark']);
    });

    it('leaves an unlit numeral bare — the bloom is what "lit" means', () => {
      expect(haloIds(mount({ streak: 12, extendedToday: false }))).toEqual([]);
      expect(haloIds(mount({ streak: 0, extendedToday: false }))).toEqual([]);
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

    it('dismisses to where its sub-label says, in one navigation', () => {
      const { getByText } = mount({ streak: 12, extendedToday: false });
      fireEvent.press(getByText('Scan ticket'));
      // One operation, not a back() and a push() racing in the same tick.
      expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/scanner');
      expect(router.push).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
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

  describe('a dead run', () => {
    // Product call: the logged days themselves are real history and stay
    // painted. The rain-cloud and milestone marks are annotations OF a run
    // ("a check bridged this", "the count hit 7 here") and have no subject
    // once the run is over — both derive from a last_activity_date that now
    // belongs to a run that ended.
    it('keeps active days but drops the run-relative annotations', () => {
      mockCard.mockReturnValue({
        enabled: true,
        loaded: true,
        reload: jest.fn(),
        card: {
          ...card({ streak: 30, extendedToday: false, rainChecksUsed: 1, alive: false }),
          effectiveStreak: 0,
        },
      });

      const { queryByLabelText, getAllByLabelText } = render(<StreakScreen />);
      expect(queryByLabelText(/covered by a rain check/)).toBeNull();
      expect(queryByLabelText(/milestone reached/)).toBeNull();
      // the history is still on the calendar
      expect(getAllByLabelText(/, active$/).length).toBeGreaterThan(0);
    });
  });

  describe('the flag gate', () => {
    it('renders nothing and bounces home once the flag resolves OFF', () => {
      mockGate.mockReturnValue({ enabled: false, resolved: true });
      mockCard.mockReturnValue({ enabled: false, card: null, loaded: false, reload: jest.fn() });

      const { queryByText } = render(<StreakScreen />);
      expect(queryByText('Streak')).toBeNull();
      expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('waits instead of bouncing while the flag is still UNRESOLVED', () => {
      // A cold deep link lands before PostHog answers. Redirecting on that
      // unresolved false would evict a user who is in the rollout.
      mockGate.mockReturnValue({ enabled: false, resolved: false });
      mockCard.mockReturnValue({ enabled: false, card: null, loaded: false, reload: jest.fn() });

      const { getByText } = render(<StreakScreen />);
      expect(router.replace).not.toHaveBeenCalled();
      expect(getByText('Streak')).toBeTruthy();
    });

    it('shows the header but NOT the feature chrome while unresolved', () => {
      // The ✕ has to exist — it is the only way out of a modal route. The tabs
      // pill must not, because this user may turn out not to be in the rollout.
      mockGate.mockReturnValue({ enabled: false, resolved: false });
      mockCard.mockReturnValue({ enabled: false, card: null, loaded: false, reload: jest.fn() });

      const { getByLabelText, queryByText, queryByLabelText } = render(<StreakScreen />);
      expect(getByLabelText('Close')).toBeTruthy();
      expect(queryByText('PERSONAL')).toBeNull();
      expect(queryByText('FRIENDS')).toBeNull();
      expect(queryByLabelText('Loading your streak')).toBeNull();
    });

    it('shows the chrome as soon as the flag resolves ON', () => {
      mockGate.mockReturnValue({ enabled: true, resolved: true });
      mockCard.mockReturnValue({ enabled: true, card: null, loaded: false, reload: jest.fn() });

      const { getByText, getByLabelText } = render(<StreakScreen />);
      expect(getByText('PERSONAL')).toBeTruthy();
      expect(getByLabelText('Loading your streak')).toBeTruthy();
    });
  });

  describe('load states', () => {
    it('shows the header and a skeleton — never a blank rectangle — while loading', () => {
      mockCard.mockReturnValue({ enabled: true, card: null, loaded: false, reload: jest.fn() });

      const { getByText, getByLabelText } = render(<StreakScreen />);
      // The ✕ is the only way out of a modal route, so it exists before data.
      expect(getByLabelText('Close')).toBeTruthy();
      expect(getByText('Streak')).toBeTruthy();
      expect(getByLabelText('Loading your streak')).toBeTruthy();
    });

    it('offers a retry when the card loaded but came back empty', () => {
      const reload = jest.fn();
      mockCard.mockReturnValue({ enabled: true, card: null, loaded: true, reload });

      const { getByText, getByLabelText } = render(<StreakScreen />);
      expect(getByText('We couldn’t load your streak just now.')).toBeTruthy();
      expect(getByLabelText('Close')).toBeTruthy();

      fireEvent.press(getByText('Try again'));
      expect(reload).toHaveBeenCalled();
    });

    it('falls back to replace when there is nothing to go back to', () => {
      (router.canGoBack as jest.Mock).mockReturnValue(false);
      const { getByLabelText } = mount({ streak: 12, extendedToday: true });

      fireEvent.press(getByLabelText('Close'));
      expect(router.replace).toHaveBeenCalledWith('/(tabs)');
      expect(router.back).not.toHaveBeenCalled();
    });
  });
});
