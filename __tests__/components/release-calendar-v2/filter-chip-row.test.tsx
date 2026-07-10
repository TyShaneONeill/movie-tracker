import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FilterChipRow } from '@/components/release-calendar-v2/filter-chip-row';
import { FILTER_CHIPS } from '@/hooks/use-calendar-filters';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

describe('FilterChipRow', () => {
  it('renders the watchlist chip and all FILTER_CHIPS when signed in', () => {
    const { getByText } = render(
      <FilterChipRow
        watchlistOnly={false}
        onToggleWatchlistOnly={jest.fn()}
        isChipActive={() => false}
        onToggleChip={jest.fn()}
        showWatchlistChip
      />
    );

    expect(getByText('My watchlist')).toBeTruthy();
    FILTER_CHIPS.forEach((chip) => {
      expect(getByText(chip.label)).toBeTruthy();
    });
  });

  it('hides the watchlist chip for guests', () => {
    const { queryByText } = render(
      <FilterChipRow
        watchlistOnly={false}
        onToggleWatchlistOnly={jest.fn()}
        isChipActive={() => false}
        onToggleChip={jest.fn()}
        showWatchlistChip={false}
      />
    );

    expect(queryByText('My watchlist')).toBeNull();
  });

  it('reflects active chip state via accessibilityState', () => {
    const { getByLabelText } = render(
      <FilterChipRow
        watchlistOnly
        onToggleWatchlistOnly={jest.fn()}
        isChipActive={(chip) => chip.key === FILTER_CHIPS[0].key}
        onToggleChip={jest.fn()}
        showWatchlistChip
      />
    );

    expect(getByLabelText('My watchlist filter').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText(`${FILTER_CHIPS[0].label} filter`).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText(`${FILTER_CHIPS[1].label} filter`).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('fires onToggleChip when a chip is pressed', () => {
    const onToggleChip = jest.fn();
    const { getByText } = render(
      <FilterChipRow
        watchlistOnly={false}
        onToggleWatchlistOnly={jest.fn()}
        isChipActive={() => false}
        onToggleChip={onToggleChip}
        showWatchlistChip={false}
      />
    );

    fireEvent.press(getByText(FILTER_CHIPS[0].label));
    expect(onToggleChip).toHaveBeenCalledWith(FILTER_CHIPS[0]);
  });
});
