import React from 'react';
import { render } from '@testing-library/react-native';
import { ReleaseDayList } from '@/components/calendar/release-day-list';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

const baseProps = {
  date: '2026-04-15',
  releases: [],
  watchlistIds: new Set<number>(),
  onMoviePress: jest.fn(),
  isLoading: false,
};

describe('ReleaseDayList — empty-state variants', () => {
  it('shows default empty state when no releases and watchlistOnlyEmpty is false', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} watchlistOnlyEmpty={false} />
    );
    expect(getByText('No releases on this date')).toBeTruthy();
    expect(getByText('Check another day or adjust your filters')).toBeTruthy();
    expect(queryByText('Your watchlist is empty')).toBeNull();
  });

  it('shows default empty state when watchlistOnlyEmpty is undefined', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} />
    );
    expect(getByText('No releases on this date')).toBeTruthy();
    expect(queryByText('Your watchlist is empty')).toBeNull();
  });

  it('shows watchlist-empty message when watchlistOnlyEmpty is true', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} watchlistOnlyEmpty={true} />
    );
    expect(getByText('Your watchlist is empty')).toBeTruthy();
    expect(getByText('Add movies to your watchlist to see them here')).toBeTruthy();
    expect(queryByText('No releases on this date')).toBeNull();
  });

  it('renders release cards when releases array is non-empty regardless of watchlistOnlyEmpty', () => {
    const release = {
      tmdb_id: 100,
      title: 'Test Movie',
      poster_path: '/test.jpg',
      backdrop_path: null,
      release_type: 3,
      release_type_label: 'Theatrical',
      genre_ids: [28],
      vote_average: 7.5,
      release_date: '2026-04-15',
    };
    const { queryByText } = render(
      <ReleaseDayList
        {...baseProps}
        releases={[release]}
        watchlistOnlyEmpty={true}
      />
    );
    expect(queryByText('Your watchlist is empty')).toBeNull();
    expect(queryByText('No releases on this date')).toBeNull();
  });
});
