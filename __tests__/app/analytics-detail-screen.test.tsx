import { render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AnalyticsDetailScreen from '@/app/analytics/[type]';
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

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ type: 'movies' })),
  router: { push: jest.fn(), back: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-premium', () => ({
  usePremiumGate: jest.fn(),
}));

jest.mock('@/hooks/use-analytics-detail', () => ({
  useAnalyticsDetail: jest.fn(),
}));

const mockUsePremiumGate = usePremiumGate as jest.Mock;
const mockUseAnalyticsDetail = useAnalyticsDetail as jest.Mock;

// The `stats_v2` flag gate was stripped 2026-07-18 (issue #661) — the route
// now renders the v2 reskin (`RankedDetailV2`) unconditionally.
describe('AnalyticsDetailScreen', () => {
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

  it('renders the v2 reskin', () => {
    const { getByTestId, getByText } = render(<AnalyticsDetailScreen />);

    expect(getByTestId('ranked-detail-v2')).toBeTruthy();
    expect(getByText('Movies Watched')).toBeTruthy();
  });

  it('free user → v2 shell renders the reused paywall', () => {
    mockUsePremiumGate.mockReturnValue({ isUnlocked: false, isLoading: false });
    const { getByTestId, getByText, queryByTestId } = render(<AnalyticsDetailScreen />);

    expect(getByTestId('ranked-detail-v2')).toBeTruthy();
    expect(getByText('Unlock Advanced Stats')).toBeTruthy();
    expect(getByText('See Plans')).toBeTruthy();
    expect(queryByTestId('ranked-row-compact')).toBeNull();
  });
});
