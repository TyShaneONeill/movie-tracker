import {
  buildMonthCells,
  buildYearCells,
  yearPageStart,
  MONTH_GRID_CELLS,
  MONTH_GRID_ROWS,
  DAYS_PER_WEEK,
  YEAR_GRID_CELLS,
  YEAR_CELL_ASPECT_RATIO,
  YEARS_PER_ROW,
} from '@/lib/scan-v2/calendar-grid';

const rows = (cells: unknown[]) => cells.length / DAYS_PER_WEEK;
const days = (cells: (number | null)[]) => cells.filter((d): d is number => d != null);

describe('buildMonthCells', () => {
  // The whole point of #781: the sheet is content-height, so a month that needs
  // fewer rows must still emit the same number of cells.
  it('emits a constant 42 cells (6 rows) regardless of month shape', () => {
    // July 2022 — starts Friday, 31 days: the 6-row worst case.
    expect(buildMonthCells(2022, 6)).toHaveLength(MONTH_GRID_CELLS);
    expect(rows(buildMonthCells(2022, 6))).toBe(MONTH_GRID_ROWS);
    // February 2026 — starts Sunday, 28 days: exactly 4 rows of content.
    expect(buildMonthCells(2026, 1)).toHaveLength(MONTH_GRID_CELLS);
    expect(rows(buildMonthCells(2026, 1))).toBe(MONTH_GRID_ROWS);
    // March 2022 — a 5-row month.
    expect(buildMonthCells(2022, 2)).toHaveLength(MONTH_GRID_CELLS);
    expect(rows(buildMonthCells(2022, 2))).toBe(MONTH_GRID_ROWS);
  });

  it('places every day of the month, in order, exactly once', () => {
    expect(days(buildMonthCells(2022, 6))).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1)
    );
    expect(days(buildMonthCells(2026, 1))).toHaveLength(28);
    expect(days(buildMonthCells(2024, 1))).toHaveLength(29); // leap February
  });

  it('leads with blanks up to the first weekday and pads the tail', () => {
    // Feb 2026 starts on a Sunday → no lead-in blanks, 14 trailing.
    const feb = buildMonthCells(2026, 1);
    expect(feb[0]).toBe(1);
    expect(feb.slice(28).every((d) => d == null)).toBe(true);

    // Jul 2022 starts on a Friday → 5 lead-in blanks.
    const jul = buildMonthCells(2022, 6);
    expect(jul.slice(0, 5).every((d) => d == null)).toBe(true);
    expect(jul[5]).toBe(1);
  });
});

describe('yearPageStart / buildYearCells', () => {
  it('centers the selected year on its page', () => {
    const page = buildYearCells(yearPageStart(2026));
    expect(page).toHaveLength(YEAR_GRID_CELLS);
    expect(page.indexOf(2026)).toBe(5);
    expect(page[0]).toBe(2021);
    expect(page[YEAR_GRID_CELLS - 1]).toBe(2032);
  });

  it('pages by exactly 12 with no gap or overlap', () => {
    const first = buildYearCells(yearPageStart(2026));
    const next = buildYearCells(yearPageStart(2026) + YEAR_GRID_CELLS);
    expect(next[0]).toBe(first[YEAR_GRID_CELLS - 1] + 1);
  });
});

describe('YEAR_CELL_ASPECT_RATIO', () => {
  it('makes the 3-row year grid exactly as tall as the 6-row month grid', () => {
    // Width/height of a year cell, expressed against an arbitrary grid width.
    const W = 700;
    const monthGridHeight = MONTH_GRID_ROWS * (W / DAYS_PER_WEEK);
    const yearCellWidth = W / YEARS_PER_ROW;
    const yearGridHeight =
      (YEAR_GRID_CELLS / YEARS_PER_ROW) * (yearCellWidth / YEAR_CELL_ASPECT_RATIO);
    expect(yearGridHeight).toBeCloseTo(monthGridHeight, 6);
  });
});
