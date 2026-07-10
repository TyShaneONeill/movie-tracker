import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ReleaseCalendarDock } from '@/components/release-calendar-v2/release-calendar-dock';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

// useSafeAreaInsets() throws without a <SafeAreaProvider> in the tree, which
// this test suite doesn't set up. Fixed inset keeps the snap-point math
// deterministic (mirrors __tests__/app/release-calendar-v2-gate.test.tsx).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

// @gorhom/bottom-sheet drives real gesture/measurement APIs (getBoundingClientRect,
// reanimated worklet timers) that aren't available in this jsdom test environment —
// mirrors the codebase's existing pattern of mocking native-heavy libs in tests
// (e.g. @expo/vector-icons above). Only the test target is mocked; production
// code renders the real library.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');

  const BottomSheet = ReactActual.forwardRef(
    ({ children, onChange, ...rest }: any, ref: any) => {
      ReactActual.useImperativeHandle(ref, () => ({
        snapToIndex: (i: number) => onChange?.(i),
        close: () => {},
        expand: () => {},
      }));
      return <View {...rest}>{children}</View>;
    }
  );
  const BottomSheetView = ({ children, ...rest }: any) => <View {...rest}>{children}</View>;

  return { __esModule: true, default: BottomSheet, BottomSheetView };
});

describe('ReleaseCalendarDock — snap-state conditional rendering', () => {
  const baseProps = {
    year: 2026,
    month: 7,
    selectedDate: '2026-07-17',
    datesWithReleases: [],
    watchlistDates: [],
    personalizedDates: [],
    isLoading: false,
    onSelectDate: jest.fn(),
    onMonthChange: jest.fn(),
  };

  it('renders the week strip by default, not the month grid', () => {
    const { getByTestId, queryByTestId } = render(<ReleaseCalendarDock {...baseProps} />);

    expect(getByTestId('release-calendar-v2-dock-week')).toBeTruthy();
    expect(queryByTestId('release-calendar-v2-dock-month')).toBeNull();
  });

  it('renders week-strip nav arrows that page by week', () => {
    const onSelectDate = jest.fn();
    const { getByLabelText } = render(
      <ReleaseCalendarDock {...baseProps} onSelectDate={onSelectDate} />
    );

    fireEvent.press(getByLabelText('Next week'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-24');

    fireEvent.press(getByLabelText('Previous week'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-10');
  });

  it('expands to the month grid when "Pull up for month" is pressed', () => {
    const { getByTestId, queryByTestId, getByLabelText } = render(
      <ReleaseCalendarDock {...baseProps} />
    );

    fireEvent.press(getByLabelText('Expand to month view'));

    expect(getByTestId('release-calendar-v2-dock-month')).toBeTruthy();
    expect(queryByTestId('release-calendar-v2-dock-week')).toBeNull();
  });

  it('snaps back to the week strip when a day is tapped in the expanded month grid', () => {
    const onSelectDate = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <ReleaseCalendarDock {...baseProps} onSelectDate={onSelectDate} />
    );

    fireEvent.press(getByLabelText('Expand to month view'));
    expect(getByTestId('release-calendar-v2-dock-month')).toBeTruthy();

    // CalendarGrid renders day cells as plain pressables with the day number
    // as their text; tap day "20" in July 2026.
    fireEvent.press(getByTestId('calendar-grid').findByProps({ children: 20 }).parent);

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-20');
    expect(getByTestId('release-calendar-v2-dock-week')).toBeTruthy();
    expect(queryByTestId('release-calendar-v2-dock-month')).toBeNull();
  });
});
