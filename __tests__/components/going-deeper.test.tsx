import { render } from '@testing-library/react-native';
import {
  GoingDeeper,
  GOING_DEEPER_FEATURES,
  INSIGHTS_THRESHOLD,
  isWrappedSeason,
} from '@/components/stats-v2/going-deeper';
import { usePremium } from '@/hooks/use-premium';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

// Mock expo-linear-gradient (native module) — the Wrapped banner renders it.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

// Routed chips (e.g. Rating Personality) push a route + fire a light haptic;
// mock both native modules so the grid renders under jest.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-premium', () => ({
  usePremium: jest.fn(),
}));

const mockUsePremium = usePremium as jest.Mock;

const FREE = { isPremium: false, isLoading: false, tier: 'free' };
const MEMBER = { isPremium: true, isLoading: false, tier: 'plus' };

const BUILDABLE_COUNT = GOING_DEEPER_FEATURES.filter((f) => f.buildable).length;
const SOON_COUNT = GOING_DEEPER_FEATURES.length - BUILDABLE_COUNT;

// Fixture dates — the Wrapped window is Dec → early Jan.
const JULY = new Date(2026, 6, 15);
const DECEMBER = new Date(2026, 11, 15);
const EARLY_JAN = new Date(2027, 0, 5);
const LATE_JAN = new Date(2027, 0, 20);

const ENOUGH = INSIGHTS_THRESHOLD + 3;
const SPARSE = INSIGHTS_THRESHOLD - 1;

describe('GoingDeeper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePremium.mockReturnValue(FREE);
  });

  it('renders the section header and every chip title', () => {
    const { getByText } = render(<GoingDeeper loggedCount={ENOUGH} now={JULY} />);

    expect(getByText('Going deeper')).toBeTruthy();
    for (const feature of GOING_DEEPER_FEATURES) {
      expect(getByText(feature.title)).toBeTruthy();
    }
  });

  it('free user: teaser caption, gold "PocketStubs+" on buildable chips, "Coming soon" on the rest', () => {
    const { getByText, getAllByText, queryByText } = render(
      <GoingDeeper loggedCount={ENOUGH} now={JULY} />
    );

    expect(getByText('a taste of PocketStubs+')).toBeTruthy();
    expect(getAllByText('PocketStubs+')).toHaveLength(BUILDABLE_COUNT);
    expect(getAllByText('Coming soon')).toHaveLength(SOON_COUNT);
    expect(queryByText('Live for you')).toBeNull();
    expect(queryByText('Log a few more')).toBeNull();
  });

  it('free user with sparse data: the free gate wins — chips still read "PocketStubs+"', () => {
    const { getAllByText, queryByText } = render(
      <GoingDeeper loggedCount={SPARSE} now={JULY} />
    );

    expect(getAllByText('PocketStubs+')).toHaveLength(BUILDABLE_COUNT);
    expect(queryByText('Log a few more')).toBeNull();
  });

  it('member with enough data: "your insights" caption + "Live for you" on buildable chips', () => {
    mockUsePremium.mockReturnValue(MEMBER);

    const { getByText, getAllByText, queryByText } = render(
      <GoingDeeper loggedCount={ENOUGH} now={JULY} />
    );

    expect(getByText('your insights')).toBeTruthy();
    expect(getAllByText('Live for you')).toHaveLength(BUILDABLE_COUNT);
    // not-yet-buildable features stay "Coming soon" regardless of membership
    expect(getAllByText('Coming soon')).toHaveLength(SOON_COUNT);
    expect(queryByText('PocketStubs+')).toBeNull();
  });

  it('member with sparse data: buildable chips read "Log a few more"', () => {
    mockUsePremium.mockReturnValue(MEMBER);

    const { getAllByText, queryByText } = render(
      <GoingDeeper loggedCount={SPARSE} now={JULY} />
    );

    expect(getAllByText('Log a few more')).toHaveLength(BUILDABLE_COUNT);
    expect(getAllByText('Coming soon')).toHaveLength(SOON_COUNT);
    expect(queryByText('Live for you')).toBeNull();
  });

  it('holds the caption and chip states while premium status is loading', () => {
    mockUsePremium.mockReturnValue({ isPremium: false, isLoading: true, tier: 'free' });

    const { getByText, queryByText } = render(<GoingDeeper loggedCount={ENOUGH} now={JULY} />);

    expect(queryByText('a taste of PocketStubs+')).toBeNull();
    expect(queryByText('your insights')).toBeNull();
    // no free-tier state flash for members: status lines hold too
    expect(queryByText('PocketStubs+')).toBeNull();
    expect(queryByText('Coming soon')).toBeNull();
    expect(queryByText('Live for you')).toBeNull();
    // titles still render so the layout doesn't jump when status resolves
    expect(getByText('Taste Profile')).toBeTruthy();
  });

  it('hides the Wrapped banner outside the Dec → early-Jan window', () => {
    const { queryByText } = render(<GoingDeeper loggedCount={ENOUGH} now={JULY} />);

    expect(queryByText(/Wrapped/)).toBeNull();
  });

  it('shows the Wrapped banner in December, titled with the current year', () => {
    const { getByText } = render(<GoingDeeper loggedCount={ENOUGH} now={DECEMBER} />);

    expect(getByText('Your 2026, Wrapped')).toBeTruthy();
    expect(getByText('Available now · free for everyone')).toBeTruthy();
  });

  it('shows the Wrapped banner in early January, looking back at the year just ended', () => {
    const { getByText } = render(<GoingDeeper loggedCount={ENOUGH} now={EARLY_JAN} />);

    expect(getByText('Your 2026, Wrapped')).toBeTruthy();
  });

  it('hides the Wrapped banner once early January has passed', () => {
    const { queryByText } = render(<GoingDeeper loggedCount={ENOUGH} now={LATE_JAN} />);

    expect(queryByText(/Wrapped/)).toBeNull();
  });
});

describe('isWrappedSeason', () => {
  it('is true for all of December and the first week of January', () => {
    expect(isWrappedSeason(new Date(2026, 11, 1))).toBe(true);
    expect(isWrappedSeason(new Date(2026, 11, 31))).toBe(true);
    expect(isWrappedSeason(new Date(2027, 0, 7))).toBe(true);
  });

  it('is false the rest of the year', () => {
    expect(isWrappedSeason(new Date(2027, 0, 8))).toBe(false);
    expect(isWrappedSeason(new Date(2026, 6, 15))).toBe(false);
    expect(isWrappedSeason(new Date(2026, 10, 30))).toBe(false);
  });
});
