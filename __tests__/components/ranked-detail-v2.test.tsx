import { View } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useLocalSearchParams } from 'expo-router';
import { RankedDetailV2, type RankedDetailConfig } from '@/components/stats-v2/ranked-detail-v2';
import { STATS_DENSITY_STORAGE_KEY } from '@/hooks/use-stats-density';
import { usePremiumGate } from '@/hooks/use-premium';
import { useAnalyticsDetail } from '@/hooks/use-analytics-detail';
import type { AnalyticsDetailItem, AnalyticsDetailType } from '@/lib/analytics-detail-service';

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

const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockUsePremiumGate = usePremiumGate as jest.Mock;
const mockUseAnalyticsDetail = useAnalyticsDetail as jest.Mock;
const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

const ALL_TYPES: AnalyticsDetailType[] = [
  'movies',
  'tv-shows',
  'episodes',
  'tv-watch-time',
  'first-takes',
  'ratings',
  'monthly',
  'genre',
  'other-genres',
];

const configs = Object.fromEntries(
  ALL_TYPES.map((t) => [t, { title: `Title ${t}`, getSubtitle: (n: number) => `${n} items` }])
) as Record<AnalyticsDetailType, RankedDetailConfig>;

const items: AnalyticsDetailItem[] = [
  {
    id: '1',
    tmdbId: 550,
    title: 'Fight Club',
    posterPath: '/fc.jpg',
    year: '1999',
    mediaType: 'movie',
    primaryMetric: 'Watched Jun 5, 2026',
  },
  {
    id: '2',
    tmdbId: 680,
    title: 'Pulp Fiction',
    posterPath: '/pf.jpg',
    year: '1994',
    mediaType: 'movie',
    primaryMetric: 'Watched May 1, 2026',
    secondaryMetric: '9.0',
  },
];

function renderScreen() {
  return render(
    <RankedDetailV2 configs={configs} renderPaywall={() => <View testID="v1-paywall" />} />
  );
}

describe('RankedDetailV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ type: 'movies' });
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockUsePremiumGate.mockReturnValue({ isUnlocked: true, isLoading: false });
    mockUseAnalyticsDetail.mockReturnValue({
      data: items,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('gating: free users see the reused v1 paywall, no list, no toggle', () => {
    mockUsePremiumGate.mockReturnValue({ isUnlocked: false, isLoading: false });
    const { getByTestId, queryByTestId, queryByText } = renderScreen();

    expect(getByTestId('v1-paywall')).toBeTruthy();
    expect(queryByTestId('ranked-row-compact')).toBeNull();
    expect(queryByTestId('density-toggle')).toBeNull();
    expect(queryByText('Fight Club')).toBeNull();
    // Data fetch stays gated off for free users
    expect(mockUseAnalyticsDetail).toHaveBeenCalledWith('movies', undefined, false);
  });

  it('members see the ranked list, compact by default, with title and subtitle', () => {
    const { getAllByTestId, getByText, queryAllByTestId } = renderScreen();

    expect(getByText('Title movies')).toBeTruthy();
    expect(getByText('2 items')).toBeTruthy();
    expect(getByText(/Fight Club/)).toBeTruthy();
    expect(getAllByTestId('ranked-row-compact')).toHaveLength(2);
    expect(queryAllByTestId('ranked-row-detailed')).toHaveLength(0);
  });

  it('density toggle switches to detailed rows and persists the choice', async () => {
    const { getByTestId, getAllByTestId, queryAllByTestId } = renderScreen();

    fireEvent.press(getByTestId('density-toggle'));

    expect(getAllByTestId('ranked-row-detailed')).toHaveLength(2);
    expect(queryAllByTestId('ranked-row-compact')).toHaveLength(0);
    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(STATS_DENSITY_STORAGE_KEY, 'detailed')
    );
  });

  it('opens in detailed when "detailed" was persisted previously', async () => {
    mockGetItem.mockResolvedValue('detailed');
    const { findAllByTestId } = renderScreen();
    expect(await findAllByTestId('ranked-row-detailed')).toHaveLength(2);
  });

  it('shows the v2 empty state when a member has no data', () => {
    mockUseAnalyticsDetail.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    const { getByText, queryByTestId } = renderScreen();

    expect(getByText('Nothing here yet')).toBeTruthy();
    expect(queryByTestId('density-toggle')).toBeNull();
  });

  it.each([
    [
      'monthly',
      { type: 'monthly', month: '2026-06', label: 'Jun' },
      ['monthly', { month: '2026-06' }, true],
    ],
    [
      'genre',
      { type: 'genre', genreId: '28', genreName: 'Action' },
      ['genre', { genreId: 28 }, true],
    ],
    [
      'other-genres',
      { type: 'other-genres', genreIds: '99,16,abc' },
      ['other-genres', { otherGenreIds: [99, 16] }, true],
    ],
    ['unknown type falls back to movies', { type: 'bogus' }, ['movies', undefined, true]],
  ])('parses route params into the %s detail fetch', (_name, params, expected) => {
    mockUseLocalSearchParams.mockReturnValue(params);
    renderScreen();
    expect(mockUseAnalyticsDetail).toHaveBeenCalledWith(...expected);
  });

  it('uses the label/genreName params as the monthly/genre titles', () => {
    mockUseLocalSearchParams.mockReturnValue({ type: 'genre', genreId: '28', genreName: 'Action' });
    const { getByText } = renderScreen();
    expect(getByText('Action')).toBeTruthy();
  });

  it('shows the skeleton while the list is loading', () => {
    mockUseAnalyticsDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    const { getByTestId } = renderScreen();
    expect(getByTestId('ranked-detail-skeleton')).toBeTruthy();
  });
});
