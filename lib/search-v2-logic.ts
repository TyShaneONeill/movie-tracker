/**
 * Pure logic for Search v2 (Proposal 01.2).
 *
 * The v2 screen fans out over the existing edge functions (search-movies for
 * titles, search-movies actor-mode for people, search-tv-shows for TV) and
 * merges the results here into one unified list, scoped after the fact by
 * chips. Keeping the merge / scope-filter / rescue logic pure makes it unit
 * testable and keeps the screen component thin.
 *
 * App-user (profile) search is intentionally NOT part of the unified set — it
 * is a separate on-demand query under the Users scope (see the screen).
 */

import type { TMDBMovie, TMDBTvShow, TMDBActor } from './tmdb.types';

/** The three content scopes carried in the unified result set. */
export type MediaScope = 'movie' | 'tv' | 'person';
/** Every selectable scope chip. `user` is backed by a separate query. */
export type SearchScope = 'all' | MediaScope | 'user';

export interface UnifiedResult {
  key: string;
  scope: MediaScope;
  id: number;
  title: string;
  /** poster_path for movie/tv, profile_path for person. */
  posterPath: string | null;
  meta: string;
  raw: TMDBMovie | TMDBTvShow | TMDBActor;
}

export interface ScopeCounts {
  all: number;
  movie: number;
  tv: number;
  person: number;
}

export interface RescueCopy {
  /** Plain lead sentence, ends just before the emphasised phrase. */
  lead: string;
  /** Rose-tinted emphasis phrase. */
  emphasis: string;
  /** Rose outline pill copy. */
  cta: string;
}

const yearOf = (date: string | undefined | null): string =>
  date ? date.split('-')[0] : '';

const ratingOf = (vote: number | undefined | null): string =>
  vote ? `★ ${vote.toFixed(1)}` : '';

export function movieToResult(movie: TMDBMovie): UnifiedResult {
  const meta = [yearOf(movie.release_date), ratingOf(movie.vote_average)]
    .filter(Boolean)
    .join(' · ');
  return {
    key: `movie-${movie.id}`,
    scope: 'movie',
    id: movie.id,
    title: movie.title,
    posterPath: movie.poster_path,
    meta,
    raw: movie,
  };
}

export function tvToResult(show: TMDBTvShow): UnifiedResult {
  const meta = [yearOf(show.first_air_date), 'Series', ratingOf(show.vote_average)]
    .filter(Boolean)
    .join(' · ');
  return {
    key: `tv-${show.id}`,
    scope: 'tv',
    id: show.id,
    title: show.name,
    posterPath: show.poster_path,
    meta,
    raw: show,
  };
}

/**
 * Builds a person result from the actor returned by search-movies actor-mode.
 * `knownForTitles` are the titles of the movies that call returns — a cheap
 * known-for line that needs no extra API request (TMDBActor carries no
 * department, so we surface titles rather than a "Director ·" label).
 */
export function personToResult(actor: TMDBActor, knownForTitles: string[]): UnifiedResult {
  const meta = knownForTitles.filter(Boolean).slice(0, 3).join(', ');
  return {
    key: `person-${actor.id}`,
    scope: 'person',
    id: actor.id,
    title: actor.name,
    posterPath: actor.profile_path,
    meta,
    raw: actor,
  };
}

/**
 * Merges the three source lists into one ordered array: movies, then TV, then
 * people. Order matters — the first item is the "top result".
 */
export function buildUnifiedResults(
  movies: TMDBMovie[],
  tvShows: TMDBTvShow[],
  person: TMDBActor | null,
  personKnownForTitles: string[] = []
): UnifiedResult[] {
  const results: UnifiedResult[] = [
    ...movies.map(movieToResult),
    ...tvShows.map(tvToResult),
  ];
  if (person) results.push(personToResult(person, personKnownForTitles));
  return results;
}

export function countsFor(results: UnifiedResult[]): ScopeCounts {
  const counts: ScopeCounts = { all: results.length, movie: 0, tv: 0, person: 0 };
  for (const r of results) counts[r.scope] += 1;
  return counts;
}

export function filterByScope(results: UnifiedResult[], scope: SearchScope): UnifiedResult[] {
  if (scope === 'all') return results;
  if (scope === 'user') return [];
  return results.filter((r) => r.scope === scope);
}

const MEDIA_SCOPES: MediaScope[] = ['movie', 'tv', 'person'];

/**
 * Picks the scope to rescue the user toward: the active content scope has zero
 * hits but another content scope has some. Returns the non-active content scope
 * with the most hits (ties resolve movie > tv > person). Returns null when
 * there is no rescue to offer, or when the active scope is All / Users.
 */
export function selectRescueTarget(
  activeScope: SearchScope,
  counts: ScopeCounts
): MediaScope | null {
  if (activeScope === 'all' || activeScope === 'user') return null;
  if (counts[activeScope] > 0) return null;
  const others = MEDIA_SCOPES.filter((s) => s !== activeScope && counts[s] > 0);
  if (others.length === 0) return null;
  // Stable sort by count desc keeps the movie>tv>person tie-break order.
  others.sort((a, b) => counts[b] - counts[a]);
  return others[0];
}

const SCOPE_LABEL: Record<MediaScope, string> = {
  movie: 'Movies',
  tv: 'TV',
  person: 'People',
};

const FROM_PLURAL: Record<MediaScope, string> = {
  movie: 'movies',
  tv: 'shows',
  person: 'people',
};

const BRIDGE: Record<string, string> = {
  'movie>tv': 'The show, though — ',
  'movie>person': 'Someone by that name, though — ',
  'tv>movie': 'There’s a film, though — ',
  'tv>person': 'Someone by that name, though — ',
  'person>movie': 'A title matches, though — ',
  'person>tv': 'A title matches, though — ',
};

const EMPHASIS: Record<MediaScope, string> = {
  tv: 'it’s in TV.',
  movie: 'it’s in Movies.',
  person: 'they’re in People.',
};

/** Builds the "no wrong door" rescue copy for a (from → to) scope pair. */
export function rescueCopy(query: string, from: MediaScope, to: MediaScope): RescueCopy {
  const bridge = BRIDGE[`${from}>${to}`] ?? 'Found elsewhere, though — ';
  return {
    lead: `No ${FROM_PLURAL[from]} called “${query.trim()}”. ${bridge}`,
    emphasis: EMPHASIS[to],
    cta: `Show all ${SCOPE_LABEL[to]} results →`,
  };
}

export function scopeLabel(scope: MediaScope): string {
  return SCOPE_LABEL[scope];
}

/**
 * Formats a recent-search timestamp for the idle "ledger" rows: Today,
 * Yesterday, a weekday within the last week, else "Mon D". `now` is injectable
 * for tests.
 */
export function formatLedgerDate(timestamp: number, now: number = Date.now()): string {
  const then = new Date(timestamp);
  const today = new Date(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(then)) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return then.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
