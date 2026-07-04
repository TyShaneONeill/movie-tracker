import { render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AnalyticsDetailScreen from '@/app/analytics/[type]';
import { useStatsV2 } from '@/hooks/use-stats-v2';
import { usePremiumGate } from '@/hooks/use-premium';
import { useAnalyticsDetail } from '@/hooks/use-analytics-detail';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// The v1 header renders an inline react-native-svg chevron.
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Path: View, Circle: View, Rect: View, G: View };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ type: 'movies' })),
  router: { push: jest.fn(), back: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-stats-v2', () => ({
  useStatsV2: jest.fn(),
}));

jest.mock('@/hooks/use-premium', () => ({
  usePremiumGate: jest.fn(),
}));

jest.mock('@/hooks/use-analytics-detail', () => ({
  useAnalyticsDetail: jest.fn(),
}));

const mockUseStatsV2 = useStatsV2 as jest.Mock;
const mockUsePremiumGate = usePremiumGate as jest.Mock;
const mockUseAnalyticsDetail = useAnalyticsDetail as jest.Mock;

describe('AnalyticsDetailScreen stats_v2 gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockUsePremiumGate.mockReturnValue({ isUnlocked: true, isLoading: false });
    mockUseAnalyticsDetail.mockReturnValue({
      data: [
        {
          id: '1',
          tmdbId: 550,
          title: 'Fight Club',
          posterPath: '/fc.jpg',
          year: '1999',
          mediaType: 'movie',
          primaryMetric: 'Watched Jun 5, 2026',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('flag OFF → renders the v1 detail (no v2 shell)', () => {
    mockUseStatsV2.mockReturnValue({ variant: 'v1', resolving: false });
    const { queryByTestId, getByText } = render(<AnalyticsDetailScreen />);

    expect(queryByTestId('ranked-detail-v2')).toBeNull();
    expect(getByText('Movies Watched')).toBeTruthy();
  });

  it('flag ON → renders the v2 reskin', () => {
    mockUseStatsV2.mockReturnValue({ variant: 'v2', resolving: false });
    const { getByTestId, getByText } = render(<AnalyticsDetailScreen />);

    expect(getByTestId('ranked-detail-v2')).toBeTruthy();
    expect(getByText('Movies Watched')).toBeTruthy(); // reuses the v1 SCREEN_CONFIGS titles
  });

  it('flag ON + free user → v2 shell renders the reused v1 paywall', () => {
    mockUseStatsV2.mockReturnValue({ variant: 'v2', resolving: false });
    mockUsePremiumGate.mockReturnValue({ isUnlocked: false, isLoading: false });
    const { getByTestId, getByText, queryByTestId } = render(<AnalyticsDetailScreen />);

    expect(getByTestId('ranked-detail-v2')).toBeTruthy();
    expect(getByText('Unlock Advanced Stats')).toBeTruthy();
    expect(getByText('See Plans')).toBeTruthy();
    expect(queryByTestId('ranked-row-compact')).toBeNull();
  });

  it('resolving → holds a neutral screen (neither v1 nor v2)', () => {
    mockUseStatsV2.mockReturnValue({ variant: 'v1', resolving: true });
    const { queryByTestId, queryByText } = render(<AnalyticsDetailScreen />);

    expect(queryByTestId('ranked-detail-v2')).toBeNull();
    expect(queryByText('Movies Watched')).toBeNull();
  });
});
