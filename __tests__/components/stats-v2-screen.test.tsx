import { render } from '@testing-library/react-native';
import { StatsV2Screen } from '@/components/stats-v2/stats-v2-screen';
import { useUserStats } from '@/hooks/use-user-stats';
import { usePremium } from '@/hooks/use-premium';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

// Mock expo-linear-gradient (native module) — the Your Year bars render it.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/use-premium', () => ({
  usePremium: jest.fn(),
}));

// Stub the banner ad — the real component reads the ads context (and lazily
// requires react-native-google-mobile-ads); here we only care whether the
// screen mounts it at all for the current membership.
jest.mock('@/components/ads/banner-ad', () => {
  const { View } = require('react-native');
  return {
    BannerAdComponent: () => <View testID="banner-ad" />,
  };
});

jest.mock('@/hooks/use-user-stats', () => ({
  useUserStats: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockUseUserStats = useUserStats as jest.Mock;
const mockUsePremium = usePremium as jest.Mock;

// The Your Year graph keys months off the device clock, so fixtures are built
// against the real current year/month to stay deterministic year-round.
const NOW = new Date();
const THIS_YEAR = NOW.getFullYear();
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function monthEntry(year: number, monthIndex: number, count: number) {
  return {
    month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    monthLabel: MONTH_LABELS[monthIndex],
    count,
  };
}

const populatedGenres = [
  { genreId: 28, genreName: 'Action', count: 9, percentage: 45 },
  { genreId: 35, genreName: 'Comedy', count: 5, percentage: 25 },
  { genreId: 18, genreName: 'Drama', count: 4, percentage: 20 },
];

const populatedStats = {
  summary: {
    totalWatched: 69,
    totalTvWatched: 3,
    totalFirstTakes: 5,
    averageRating: 7.7,
    totalEpisodesWatched: 16,
    totalWatchTimeMinutes: 798,
  },
  genres: [],
  monthlyActivity: [],
};

describe('StatsV2Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePremium.mockReturnValue({ isPremium: false, isLoading: false, tier: 'free' });
  });

  it('renders the hero block with formatted stats when populated', () => {
    mockUseUserStats.mockReturnValue({
      data: populatedStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<StatsV2Screen />);

    expect(getByText('Analytics')).toBeTruthy();
    expect(getByText('Free')).toBeTruthy();
    // heroes
    expect(getByText('Movies')).toBeTruthy();
    expect(getByText('69')).toBeTruthy();
    expect(getByText('TV Shows')).toBeTruthy();
    // support row
    expect(getByText('16')).toBeTruthy(); // episodes
    expect(getByText('13h 18m')).toBeTruthy(); // 798 minutes
    expect(getByText('7.7')).toBeTruthy(); // avg rating
    expect(getByText('First Takes')).toBeTruthy();
  });

  it('renders the "Add your first" empty state when nothing is logged', () => {
    mockUseUserStats.mockReturnValue({
      data: {
        ...populatedStats,
        summary: {
          totalWatched: 0,
          totalTvWatched: 0,
          totalFirstTakes: 0,
          averageRating: null,
          totalEpisodesWatched: 0,
          totalWatchTimeMinutes: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getAllByText, queryByText } = render(<StatsV2Screen />);

    // both hero stats show the add-your-first affordance in place of values
    expect(getAllByText('Add your first')).toHaveLength(2);
    expect(queryByText('0')).toBeNull();
  });

  it('shows the skeleton while stats are loading', () => {
    mockUseUserStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    const { getByTestId } = render(<StatsV2Screen />);

    // the skeleton overlay covers the (animated, opacity-0) content layer
    expect(getByTestId('stats-v2-skeleton')).toBeTruthy();
  });

  it('renders the Your Year graph when the year has activity', () => {
    mockUseUserStats.mockReturnValue({
      data: {
        ...populatedStats,
        monthlyActivity: [monthEntry(THIS_YEAR, NOW.getMonth(), 12)],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<StatsV2Screen />);

    expect(getByText(`YOUR YEAR · ${THIS_YEAR}`)).toBeTruthy();
    // year total (12) with the "movies" unit in accent
    expect(getByText('movies')).toBeTruthy();
    // the current month's count renders above its bar
    expect(getByText('12')).toBeTruthy();
  });

  it('hides the Your Year card entirely when nothing is logged this year', () => {
    mockUseUserStats.mockReturnValue({
      data: {
        ...populatedStats,
        genres: populatedGenres,
        // rolling window: prior-year activity + a zero current-year month
        monthlyActivity: [
          monthEntry(THIS_YEAR - 1, 10, 4),
          monthEntry(THIS_YEAR, NOW.getMonth(), 0),
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { queryByText, getByText } = render(<StatsV2Screen />);

    expect(queryByText(`YOUR YEAR · ${THIS_YEAR}`)).toBeNull();
    // genres live inside the Your Year card, so they hide with it
    expect(queryByText('TOP GENRES')).toBeNull();
    // the hero block still shows
    expect(getByText('Movies')).toBeTruthy();
    expect(getByText('69')).toBeTruthy();
  });

  it('renders the genre split bar and legend inside the Your Year card', () => {
    mockUseUserStats.mockReturnValue({
      data: {
        ...populatedStats,
        genres: populatedGenres,
        monthlyActivity: [monthEntry(THIS_YEAR, NOW.getMonth(), 7)],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<StatsV2Screen />);

    expect(getByText('TOP GENRES')).toBeTruthy();
    // legend rows: name + mono percentage
    expect(getByText('Action')).toBeTruthy();
    expect(getByText('45%')).toBeTruthy();
    expect(getByText('Comedy')).toBeTruthy();
    expect(getByText('25%')).toBeTruthy();
    expect(getByText('Drama')).toBeTruthy();
    expect(getByText('20%')).toBeTruthy();
  });

  it('renders the Going deeper section and the ad banner for free users', () => {
    mockUseUserStats.mockReturnValue({
      data: populatedStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText, getByTestId } = render(<StatsV2Screen />);

    expect(getByText('Going deeper')).toBeTruthy();
    expect(getByText('a taste of PocketStubs+')).toBeTruthy();
    expect(getByTestId('banner-ad')).toBeTruthy();
  });

  it('never mounts the ad banner for members', () => {
    mockUsePremium.mockReturnValue({ isPremium: true, isLoading: false, tier: 'plus' });
    mockUseUserStats.mockReturnValue({
      data: populatedStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText, queryByTestId } = render(<StatsV2Screen />);

    expect(getByText('your insights')).toBeTruthy();
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('holds the ad banner while premium status is still resolving', () => {
    mockUsePremium.mockReturnValue({ isPremium: false, isLoading: true, tier: 'free' });
    mockUseUserStats.mockReturnValue({
      data: populatedStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { queryByTestId } = render(<StatsV2Screen />);

    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('still shows Going deeper in the first-run empty state', () => {
    mockUseUserStats.mockReturnValue({
      data: {
        ...populatedStats,
        summary: {
          totalWatched: 0,
          totalTvWatched: 0,
          totalFirstTakes: 0,
          averageRating: null,
          totalEpisodesWatched: 0,
          totalWatchTimeMinutes: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<StatsV2Screen />);

    expect(getByText('Going deeper')).toBeTruthy();
  });

  it('shows the error state when the fetch fails with no cached data', () => {
    mockUseUserStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('network down'),
      refetch: jest.fn(),
    });

    const { getByText } = render(<StatsV2Screen />);

    expect(getByText('Failed to load stats')).toBeTruthy();
    expect(getByText('network down')).toBeTruthy();
  });
});
