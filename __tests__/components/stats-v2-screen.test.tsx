import { render } from '@testing-library/react-native';
import { StatsV2Screen } from '@/components/stats-v2/stats-v2-screen';
import { useUserStats } from '@/hooks/use-user-stats';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/use-premium', () => ({
  usePremium: () => ({ isPremium: false, isLoading: false, tier: 'free' }),
}));

jest.mock('@/hooks/use-user-stats', () => ({
  useUserStats: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockUseUserStats = useUserStats as jest.Mock;

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
