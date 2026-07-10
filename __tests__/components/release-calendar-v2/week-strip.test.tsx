import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeekStrip } from '@/components/release-calendar-v2/week-strip';
import { getWeekDates } from '@/lib/release-calendar-week';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

const weekDates = getWeekDates('2026-07-17'); // Sun 07-12 .. Sat 07-18

describe('WeekStrip', () => {
  it('renders all 7 days with their day numbers', () => {
    const { getByText } = render(
      <WeekStrip
        weekDates={weekDates}
        selectedDate="2026-07-17"
        datesWithReleases={[]}
        watchlistDates={[]}
        personalizedDates={[]}
        onSelectDate={jest.fn()}
        onSwipeWeek={jest.fn()}
      />
    );

    ['12', '13', '14', '15', '16', '17', '18'].forEach((day) => {
      expect(getByText(day)).toBeTruthy();
    });
  });

  it('marks the selected day via accessibilityState', () => {
    const { getByLabelText } = render(
      <WeekStrip
        weekDates={weekDates}
        selectedDate="2026-07-17"
        datesWithReleases={[]}
        watchlistDates={[]}
        personalizedDates={[]}
        onSelectDate={jest.fn()}
        onSwipeWeek={jest.fn()}
      />
    );

    expect(getByLabelText('Select 2026-07-17').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('Select 2026-07-12').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('fires onSelectDate with the tapped date', () => {
    const onSelectDate = jest.fn();
    const { getByLabelText } = render(
      <WeekStrip
        weekDates={weekDates}
        selectedDate="2026-07-17"
        datesWithReleases={[]}
        watchlistDates={[]}
        personalizedDates={[]}
        onSelectDate={onSelectDate}
        onSwipeWeek={jest.fn()}
      />
    );

    fireEvent.press(getByLabelText('Select 2026-07-14'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-14');
  });

  it('fires onSwipeWeek("next") on a fast leftward swipe', () => {
    const onSwipeWeek = jest.fn();
    const { getByTestId } = render(
      <WeekStrip
        weekDates={weekDates}
        selectedDate="2026-07-17"
        datesWithReleases={[]}
        watchlistDates={[]}
        personalizedDates={[]}
        onSelectDate={jest.fn()}
        onSwipeWeek={onSwipeWeek}
      />
    );

    const strip = getByTestId('release-calendar-v2-week-strip');
    fireEvent(strip, 'touchStart', { nativeEvent: { pageX: 300, pageY: 100 } });
    fireEvent(strip, 'touchEnd', { nativeEvent: { pageX: 200, pageY: 105 } });

    expect(onSwipeWeek).toHaveBeenCalledWith('next');
  });

  it('fires onSwipeWeek("prev") on a fast rightward swipe', () => {
    const onSwipeWeek = jest.fn();
    const { getByTestId } = render(
      <WeekStrip
        weekDates={weekDates}
        selectedDate="2026-07-17"
        datesWithReleases={[]}
        watchlistDates={[]}
        personalizedDates={[]}
        onSelectDate={jest.fn()}
        onSwipeWeek={onSwipeWeek}
      />
    );

    const strip = getByTestId('release-calendar-v2-week-strip');
    fireEvent(strip, 'touchStart', { nativeEvent: { pageX: 100, pageY: 100 } });
    fireEvent(strip, 'touchEnd', { nativeEvent: { pageX: 220, pageY: 100 } });

    expect(onSwipeWeek).toHaveBeenCalledWith('prev');
  });
});
