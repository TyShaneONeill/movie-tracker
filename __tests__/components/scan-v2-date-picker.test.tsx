import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PickerOverlay } from '@/components/scan-v2/picker-overlay';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

// The movie picker's search chain isn't exercised here.
jest.mock('@/hooks/use-movie-search', () => ({
  useMovieSearch: () => ({ movies: [], isLoading: false, isFetching: false }),
}));

function renderDatePicker(currentValue: string, onPickValue = jest.fn()) {
  const utils = render(
    <PickerOverlay
      kind="date"
      currentValue={currentValue}
      onPickValue={onPickValue}
      onPickMovie={jest.fn()}
      onClose={jest.fn()}
    />
  );
  return { ...utils, onPickValue };
}

/** Day numbers currently on screen (weekday initials are letters, not numbers). */
const dayCount = (queryAllByText: (m: RegExp) => unknown[]) =>
  queryAllByText(/^\d{1,2}$/).length;

describe('date picker — month grid', () => {
  it('shows the seeded month and every one of its days', () => {
    // July 2022: starts Friday, 31 days — the 6-row worst case that used to
    // make the sheet (and its chevrons) jump (#781).
    const { getByText, queryAllByText } = renderDatePicker('2022-07-15');
    expect(getByText('July 2022')).toBeTruthy();
    expect(dayCount(queryAllByText as any)).toBe(31);
  });

  it('renders a short month without dropping days', () => {
    // The 42-cell padding that keeps the box height constant is asserted in
    // __tests__/lib/scan-v2-calendar-grid.test.ts (blank cells carry no text).
    const { getByText, queryAllByText } = renderDatePicker('2026-02-10');
    expect(getByText('February 2026')).toBeTruthy();
    expect(dayCount(queryAllByText as any)).toBe(28);
  });

  it('commits the tapped day as an ISO date', () => {
    const { getByText, onPickValue } = renderDatePicker('2026-07-15');
    fireEvent.press(getByText('22'));
    expect(onPickValue).toHaveBeenCalledWith('2026-07-22');
  });
});

describe('date picker — year mode', () => {
  it('opens a 12-year page centered on the selection when the header is tapped', () => {
    const { getByText, queryByText } = renderDatePicker('2026-07-15');
    fireEvent.press(getByText('July 2026'));

    expect(getByText('2021 – 2032')).toBeTruthy();
    expect(getByText('2026')).toBeTruthy();
    expect(queryByText('2020')).toBeNull();
    expect(queryByText('2033')).toBeNull();
  });

  it('pages by 12 years with the chevrons', () => {
    const { getByText, getByTestId } = renderDatePicker('2026-07-15');
    fireEvent.press(getByText('July 2026'));

    fireEvent.press(getByTestId('date-nav-next'));
    expect(getByText('2033 – 2044')).toBeTruthy();
    fireEvent.press(getByTestId('date-nav-prev'));
    expect(getByText('2021 – 2032')).toBeTruthy();
  });

  it('still steps by month when the year grid is closed', () => {
    const { getByText, getByTestId } = renderDatePicker('2026-01-15');
    fireEvent.press(getByTestId('date-nav-prev'));
    expect(getByText('December 2025')).toBeTruthy();
    fireEvent.press(getByTestId('date-nav-next'));
    expect(getByText('January 2026')).toBeTruthy();
  });

  it('applies the tapped year and returns to the month grid', () => {
    const { getByText, onPickValue } = renderDatePicker('2026-07-15');
    fireEvent.press(getByText('July 2026'));
    fireEvent.press(getByText('2022'));

    // Back in month mode on the same month, now in 2022 — and still committing
    // real ISO dates.
    expect(getByText('July 2022')).toBeTruthy();
    fireEvent.press(getByText('22'));
    expect(onPickValue).toHaveBeenCalledWith('2022-07-22');
  });
});
