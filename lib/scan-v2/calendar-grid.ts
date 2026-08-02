/**
 * Ticket Scan v2 — pure calendar geometry for the date picker's month/year grids.
 *
 * The picker sheet is content-height, so any change in grid row count moves the
 * whole sheet (and its nav chevrons) vertically. Both grids are therefore sized
 * to a CONSTANT box: the month grid always emits 42 cells (6 rows × 7 days) and
 * the year grid always emits 12 cells (3 rows × 4 years) whose cells are
 * proportioned to occupy the same six day-rows.
 */

/** Days per week — the month grid's column count. */
export const DAYS_PER_WEEK = 7;
/** Fixed row count for the month grid (the max any month + lead-in needs). */
export const MONTH_GRID_ROWS = 6;
/** Every month renders this many cells, blank-padded at both ends. */
export const MONTH_GRID_CELLS = MONTH_GRID_ROWS * DAYS_PER_WEEK; // 42

/** Columns in the year grid. */
export const YEARS_PER_ROW = 4;
/** Years shown per page (paging steps by exactly this much). */
export const YEAR_GRID_CELLS = 12;

/**
 * A month laid out on a Sunday-first grid: `null` for the lead-in blanks before
 * the 1st and the trailing blanks after the last day, day numbers in between.
 * Always exactly `MONTH_GRID_CELLS` long so the grid's height never changes.
 */
export function buildMonthCells(year: number, month: number): (number | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: MONTH_GRID_CELLS }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells[lead + d - 1] = d;
  }
  return cells;
}

/**
 * First year of the 12-year page containing `year`, placed so the current
 * selection sits mid-page rather than at an edge.
 */
export function yearPageStart(year: number): number {
  return year - 5;
}

/** The 12 years of the page starting at `start`. */
export function buildYearCells(start: number): number[] {
  return Array.from({ length: YEAR_GRID_CELLS }, (_, i) => start + i);
}

/**
 * Aspect ratio (width / height) a year cell needs so the 3-row year grid is
 * exactly as tall as the 6-row month grid. A day cell is `1/7` of the grid width
 * and square, so six rows measure `6W/7`; a year cell is `W/4` wide and one of
 * three rows, so its height must be `2W/7` → ratio `(W/4) / (2W/7)`.
 */
export const YEAR_CELL_ASPECT_RATIO =
  (1 / YEARS_PER_ROW) / (MONTH_GRID_ROWS / DAYS_PER_WEEK / (YEAR_GRID_CELLS / YEARS_PER_ROW));
