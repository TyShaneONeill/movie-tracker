/**
 * Pure logic for the Lists v2 redesign (design contract 01.2, locked 2026-07-12).
 *
 * Everything here is side-effect-free and unit-tested: the Pile deck ordering +
 * seeded rotation, the Watching (movies + TV) merge/sort, scope counts, TV
 * episode progress, list-cover candidate ranking, and programme-count copy.
 * Components stay thin; the reasoning lives here.
 */

import type { UserMovie, UserTvShow } from '@/lib/database.types';

export type MediaKind = 'movie' | 'tv';

// ============================================================================
// The Pile — deck feel constants (Ty-tuned in the playground; LOCKED)
// ============================================================================

/**
 * Watchlist-detail interactive deck constants. Ty tuned these in the contract's
 * playground; do NOT reinterpret. `depth` = max visible cards (windowed: mount
 * depth + 1). `jitter` = max rotation in degrees. `peek` = vertical px each card
 * rises behind the one above. `throwMs` = fly-off / rise duration.
 */
export const PILE = {
  depth: 8,
  jitter: 3.5,
  peek: 12,
  throwMs: 150,
  /** Drag distance (px) past which release throws the top card. */
  throwThreshold: 70,
} as const;

/** Calmer fanned-hand rotation for custom lists (decision #2). */
export const FAN_JITTER_CUSTOM = 1.8;
/** Slightly livelier fan for the Watching "now playing" card. */
export const FAN_JITTER_WATCHING = 2.4;

/**
 * Deterministic rotation multiplier in [-1, 1] seeded by a stable item id.
 * Ported verbatim from the contract playground so tilt is identical across
 * re-renders (no shimmer — the tear-line lesson). Multiply by a jitter degree.
 */
export function seededRotation(id: number): number {
  const x = Math.sin(id * 99.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Cycle the top card to the back of the pile (v1: non-destructive shuffle). */
export function cyclePileOrder<T>(order: readonly T[]): T[] {
  if (order.length <= 1) return [...order];
  const [first, ...rest] = order;
  return [...rest, first];
}

// ============================================================================
// Watching — merge movies + TV shows (status='watching')
// ============================================================================

export interface WatchingItem {
  /** Stable per-item key (media + tmdb id) for keyed local state (#662). */
  key: string;
  tmdbId: number;
  media: MediaKind;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** ISO timestamp used for most-recently-touched sort; may be null for TV. */
  updatedAt: string | null;
  voteAverage: number | null;
  // TV-only episode progress (null for movies).
  currentSeason: number | null;
  currentEpisode: number | null;
  episodesWatched: number | null;
  totalEpisodes: number | null;
}

function updatedAtMs(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

/**
 * Merge `user_movies.status='watching'` + `user_tv_shows.status='watching'`
 * into one list sorted most-recently-touched first (updated_at desc, decision
 * #4). Movies carry `title`; shows carry `name` — normalized to `title`.
 */
export function mergeWatching(
  movies: readonly UserMovie[],
  shows: readonly UserTvShow[]
): WatchingItem[] {
  const movieItems: WatchingItem[] = movies.map((m) => ({
    key: `movie:${m.tmdb_id}`,
    tmdbId: m.tmdb_id,
    media: 'movie',
    title: m.title,
    posterPath: m.poster_path,
    backdropPath: m.backdrop_path,
    updatedAt: m.updated_at,
    voteAverage: m.vote_average ?? null,
    currentSeason: null,
    currentEpisode: null,
    episodesWatched: null,
    totalEpisodes: null,
  }));

  const showItems: WatchingItem[] = shows.map((s) => ({
    key: `tv:${s.tmdb_id}`,
    tmdbId: s.tmdb_id,
    media: 'tv',
    title: s.name,
    posterPath: s.poster_path,
    backdropPath: s.backdrop_path,
    updatedAt: s.updated_at,
    voteAverage: s.vote_average ?? null,
    currentSeason: s.current_season,
    currentEpisode: s.current_episode,
    episodesWatched: s.episodes_watched,
    totalEpisodes: s.number_of_episodes,
  }));

  return [...movieItems, ...showItems].sort(
    (a, b) => updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt)
  );
}

export type WatchingScope = 'all' | 'movie' | 'tv';

export interface WatchingScopeCounts {
  all: number;
  movie: number;
  tv: number;
}

export function watchingScopeCounts(items: readonly WatchingItem[]): WatchingScopeCounts {
  let movie = 0;
  let tv = 0;
  for (const it of items) {
    if (it.media === 'movie') movie++;
    else tv++;
  }
  return { all: movie + tv, movie, tv };
}

/** Scope chips only appear when BOTH media types are present (contract B). */
export function shouldShowWatchingScopes(items: readonly WatchingItem[]): boolean {
  const c = watchingScopeCounts(items);
  return c.movie > 0 && c.tv > 0;
}

export function filterWatchingByScope(
  items: readonly WatchingItem[],
  scope: WatchingScope
): WatchingItem[] {
  if (scope === 'all') return [...items];
  return items.filter((it) => it.media === scope);
}

/**
 * "Next · S2 E5" label from the continue-watching resume point. Returns null
 * when the show has no tracked season/episode.
 */
export function nextEpisodeLabel(item: Pick<WatchingItem, 'currentSeason' | 'currentEpisode'>): string | null {
  if (item.currentSeason == null || item.currentEpisode == null) return null;
  return `Next · S${item.currentSeason} E${item.currentEpisode}`;
}

/** Episode progress fraction in [0, 1]; 0 when data is missing. */
export function episodeProgress(
  item: Pick<WatchingItem, 'episodesWatched' | 'totalEpisodes'>
): number {
  const { episodesWatched, totalEpisodes } = item;
  if (episodesWatched == null || totalEpisodes == null || totalEpisodes <= 0) return 0;
  return Math.min(Math.max(episodesWatched / totalEpisodes, 0), 1);
}

// ============================================================================
// List cover — "set the marquee" resolution (contract C)
// ============================================================================

/** Minimal candidate shape for cover ranking (works for inline or fetched data). */
export interface CoverCandidate {
  tmdbId: number;
  media: MediaKind;
  backdropPath: string | null;
  /** Popularity proxy — TMDB vote_average (no popularity is stored locally). */
  score: number | null;
}

/**
 * Smart default: the most popular candidate that HAS a backdrop (contract C).
 * "Popular" is proxied by vote_average since neither user_movies nor list_movies
 * store TMDB popularity. Returns null when no candidate has a backdrop.
 */
export function pickSmartCover(candidates: readonly CoverCandidate[]): CoverCandidate | null {
  const withBackdrop = candidates.filter((c) => !!c.backdropPath);
  if (withBackdrop.length === 0) return null;
  return withBackdrop.reduce((best, c) =>
    (c.score ?? 0) > (best.score ?? 0) ? c : best
  );
}

/**
 * Full cover resolution priority (contract C):
 *   chosen (if it has a backdrop) > smart default > first candidate with a
 *   backdrop > null (caller falls back to the gradient placeholder).
 * `chosenTmdbId` may point at a title whose backdrop we don't have inline yet —
 * the caller resolves that separately (fetch); this only decides among what's
 * already known.
 */
export function resolveCover(
  candidates: readonly CoverCandidate[],
  chosenTmdbId: number | null
): CoverCandidate | null {
  if (chosenTmdbId != null) {
    const chosen = candidates.find((c) => c.tmdbId === chosenTmdbId && !!c.backdropPath);
    if (chosen) return chosen;
  }
  return pickSmartCover(candidates);
}

// ============================================================================
// Programme-count copy
// ============================================================================

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Watchlist tab card: "19 films deep" (the endless-watchlist joke, charming). */
export function formatDeepCount(films: number): string {
  return `${plural(films, 'film')} deep`;
}

/**
 * Split count for programme cards: "1 film · 3 shows" when mixed, single medium
 * otherwise (contract A / programme cards). Zero-zero renders "0 films".
 */
export function formatSplitCount(films: number, shows: number): string {
  if (films > 0 && shows > 0) return `${plural(films, 'film')} · ${plural(shows, 'show')}`;
  if (shows > 0) return plural(shows, 'show');
  return plural(films, 'film');
}
