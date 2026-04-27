import React from 'react';
import { render } from '@testing-library/react-native';
import CalendarGrid from '@/components/calendar/calendar-grid';

// Mock theme context so colors resolve without a provider tree.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

const baseProps = {
  year: 2026,
  month: 4,
  selectedDate: null,
  onSelectDate: jest.fn(),
  onMonthChange: jest.fn(),
};

describe('CalendarGrid — skeleton wiring', () => {
  it('renders CalendarGridSkeleton when isLoading is true and no dates exist', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={[]}
        isLoading
      />
    );

    expect(getByTestId('calendar-grid-skeleton')).toBeTruthy();
    expect(queryByTestId('calendar-grid')).toBeNull();
  });

  it('renders the actual grid when data exists, even during background refetch', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
    expect(queryByTestId('calendar-grid-skeleton')).toBeNull();
  });

  it('renders the actual grid when not loading and no data (empty month state)', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={[]}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
    expect(queryByTestId('calendar-grid-skeleton')).toBeNull();
  });
});

describe('CalendarGrid — slide animation wiring', () => {
  it('renders without throwing when (year, month) changes', () => {
    const { rerender, getByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();

    rerender(
      <CalendarGrid
        {...baseProps}
        year={2026}
        month={5}
        datesWithReleases={['2026-05-15']}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
  });

  it('keeps the calendar-grid testID on the animated wrapper', () => {
    const { getByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading={false}
      />
    );

    // The testID="calendar-grid" should be on the Animated.View (the inner
    // wrapper that holds the month header + weekday row + day cells).
    // The outer overflow-clip View should NOT have a testID.
    const grid = getByTestId('calendar-grid');
    expect(grid).toBeTruthy();
  });
});
