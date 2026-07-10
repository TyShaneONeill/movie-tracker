/**
 * Pure date-math helpers for the Release Calendar v2 docked week strip.
 * All arithmetic runs on UTC epoch days so week/month boundaries are
 * DST-agnostic — no local Date object ever crosses a real timezone.
 */

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseDateString(date: string): YMD {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toDateString(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Adds `delta` days to `date` using UTC epoch-day arithmetic (DST-agnostic). */
export function addDays(date: string, delta: number): string {
  const { year, month, day } = parseDateString(date);
  const epoch = Date.UTC(year, month - 1, day) + delta * 86400000;
  const next = new Date(epoch);
  return toDateString(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** 0 (Sun) .. 6 (Sat) for `date`, computed in UTC. */
export function dayOfWeek(date: string): number {
  const { year, month, day } = parseDateString(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Returns the 7 dates (Sun..Sat) of the week containing `date`. */
export function getWeekDates(date: string): string[] {
  const start = addDays(date, -dayOfWeek(date));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Shifts `date` by `weeks` whole weeks (±7 days per week). */
export function shiftWeek(date: string, weeks: number): string {
  return addDays(date, weeks * 7);
}

/**
 * Month label for a docked week strip. A week can straddle two months;
 * the rule is: the month containing `selectedDate` if it falls within
 * `weekDates`, otherwise the month containing the first (Sunday) day
 * of the week.
 */
export function weekMonthLabel(
  weekDates: string[],
  selectedDate: string | null
): { year: number; month: number } {
  const anchor = selectedDate && weekDates.includes(selectedDate) ? selectedDate : weekDates[0];
  const { year, month } = parseDateString(anchor);
  return { year, month };
}

export function monthLabelText(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Fri · July 17 · 4 releases" / "Fri · July 17 · no releases" for a zero count. */
export function formatDayHeader(date: string, count: number): string {
  const { month, day } = parseDateString(date);
  const weekday = WEEKDAY_SHORT[dayOfWeek(date)];
  const monthDay = `${MONTH_NAMES[month - 1]} ${day}`;
  const countText = count === 0 ? 'no releases' : `${count} release${count === 1 ? '' : 's'}`;
  return `${weekday} · ${monthDay} · ${countText}`;
}
