/**
 * Copy for the "you are current on this show" state.
 *
 * The claim is deliberately two halves: an emotional past-claim ("you're up to
 * date") and a falsifiable future-claim ("next episode Jul 30"). The second is
 * not decoration — it is the audit trail. It shows the user WHY the app believes
 * they are current, and it can be checked against the episode list on the same
 * screen. A bare badge asks for trust; a badge plus a date earns it.
 *
 * Whether the user is current at all is decided server-side by
 * get_user_show_currency() (20260728010000). Nothing here re-derives it — these
 * functions only turn an already-granted verdict into words.
 */

/** Verdict row from get_user_show_currency(), one per watching show. */
export interface ShowCurrency {
  user_tv_show_id: string;
  tmdb_show_id: number;
  is_current: boolean;
  next_air_date: string | null;
  next_season: number | null;
  next_episode: number | null;
}

/** "Jul 30" — month/day is enough; the year would add noise, not information. */
export function formatAirDate(isoDate: string): string {
  // Parse as plain Y-M-D. `new Date('2026-07-30')` is parsed as UTC midnight and
  // renders as the 29th anywhere west of Greenwich — the exact off-by-one that
  // would make this line contradict the episode list next to it.
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * Detail-page sub-line, shown under the CAUGHT UP pill.
 *
 * `currentSeason` is the season the user is on, used only to tell "waiting for
 * the next episode of a season already running" apart from "finished a season,
 * waiting for the next one" — those feel different enough to a viewer to be
 * worth different words.
 */
export function caughtUpSubline(
  currency: Pick<ShowCurrency, 'next_air_date' | 'next_season'>,
  currentSeason: number | null | undefined,
): string {
  const { next_air_date, next_season } = currency;

  if (!next_air_date) {
    // Nothing scheduled anywhere. Say so plainly rather than implying a date we
    // do not have — this is the between-seasons case and it is common.
    return "You're up to date · next season TBA";
  }

  const when = formatAirDate(next_air_date);
  const startsNewSeason =
    next_season != null && currentSeason != null && next_season > currentSeason;

  return startsNewSeason
    ? `You're up to date · Season ${next_season} returns ${when}`
    : `You're up to date · next episode ${when}`;
}

/**
 * Home "Continue Watching" card line, replacing the usual "S2 E4" progress text.
 *
 * Tighter than the detail-page line because the card is ~130pt wide: it keeps
 * the claim and the date and drops everything else.
 */
export function caughtUpCardLine(
  currency: Pick<ShowCurrency, 'next_air_date'>,
): string {
  return currency.next_air_date
    ? `Caught up · ${formatAirDate(currency.next_air_date)}`
    : 'Caught up · TBA';
}
