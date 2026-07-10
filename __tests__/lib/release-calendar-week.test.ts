import {
  addDays,
  dayOfWeek,
  getWeekDates,
  shiftWeek,
  weekMonthLabel,
  monthLabelText,
  formatDayHeader,
} from '@/lib/release-calendar-week';

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-08', 3)).toBe('2026-07-11');
  });

  it('subtracts days within a month', () => {
    expect(addDays('2026-07-08', -3)).toBe('2026-07-05');
  });

  it('rolls forward across a month boundary', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
  });

  it('rolls backward across a month boundary', () => {
    expect(addDays('2026-08-01', -3)).toBe('2026-07-29');
  });

  it('rolls across a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('handles the Feb leap-year boundary (2028 is a leap year)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('handles the Feb non-leap-year boundary (2026 is not a leap year)', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('dayOfWeek', () => {
  // 2026-01-01 is a Thursday (2025-01-01 was a Wednesday; 2025 has 365 days).
  it('resolves known weekdays from the 2026-01-01 = Thursday anchor', () => {
    expect(dayOfWeek('2026-01-01')).toBe(4); // Thursday
    expect(dayOfWeek('2026-07-26')).toBe(0); // Sunday
    expect(dayOfWeek('2026-12-27')).toBe(0); // Sunday
  });
});

describe('getWeekDates', () => {
  it('returns the 7 Sun..Sat dates for a mid-week anchor', () => {
    // 2026-07-17 falls in the Sun 07-12 .. Sat 07-18 week.
    expect(getWeekDates('2026-07-17')).toEqual([
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
  });

  it('straddles a month boundary (Jul/Aug 2026)', () => {
    // 2026-07-29 (Wed) sits in the Sun 07-26 .. Sat 08-01 week.
    expect(getWeekDates('2026-07-29')).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });

  it('straddles a year boundary (Dec 2026 / Jan 2027)', () => {
    // 2026-12-30 (Wed) sits in the Sun 12-27 .. Sat 01-02 week.
    expect(getWeekDates('2026-12-30')).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('always includes the anchor date and starts on a Sunday', () => {
    const week = getWeekDates('2026-07-08');
    expect(week).toContain('2026-07-08');
    expect(dayOfWeek(week[0])).toBe(0);
    expect(week).toHaveLength(7);
  });
});

describe('shiftWeek', () => {
  it('shifts forward by whole weeks', () => {
    expect(shiftWeek('2026-07-17', 1)).toBe('2026-07-24');
    expect(shiftWeek('2026-07-17', 2)).toBe('2026-07-31');
  });

  it('shifts backward by whole weeks', () => {
    expect(shiftWeek('2026-07-17', -1)).toBe('2026-07-10');
  });

  it('crosses a month boundary when shifting', () => {
    expect(shiftWeek('2026-07-29', 1)).toBe('2026-08-05');
  });
});

describe('weekMonthLabel', () => {
  const boundaryWeek = getWeekDates('2026-07-29'); // Jul 26 .. Aug 1

  it('uses the selected day\'s month when it falls within the week', () => {
    expect(weekMonthLabel(boundaryWeek, '2026-08-01')).toEqual({ year: 2026, month: 8 });
    expect(weekMonthLabel(boundaryWeek, '2026-07-26')).toEqual({ year: 2026, month: 7 });
  });

  it('falls back to the first day\'s month when selectedDate is null', () => {
    expect(weekMonthLabel(boundaryWeek, null)).toEqual({ year: 2026, month: 7 });
  });

  it('falls back to the first day\'s month when selectedDate is outside the week', () => {
    expect(weekMonthLabel(boundaryWeek, '2026-09-15')).toEqual({ year: 2026, month: 7 });
  });
});

describe('monthLabelText', () => {
  it('formats "Month YYYY"', () => {
    expect(monthLabelText(2026, 7)).toBe('July 2026');
    expect(monthLabelText(2027, 1)).toBe('January 2027');
  });
});

describe('formatDayHeader', () => {
  it('pluralizes multiple releases', () => {
    expect(formatDayHeader('2026-07-17', 4)).toBe('Fri · July 17 · 4 releases');
  });

  it('uses singular for exactly one release', () => {
    expect(formatDayHeader('2026-07-17', 1)).toBe('Fri · July 17 · 1 release');
  });

  it('reads "no releases" for a zero count', () => {
    expect(formatDayHeader('2026-07-17', 0)).toBe('Fri · July 17 · no releases');
  });
});
