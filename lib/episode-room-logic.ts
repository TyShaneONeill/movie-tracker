/**
 * Pure logic for Episode Rooms — the per-episode discussion screen.
 *
 * A room is addressed by a compound slug `{tmdbId}-{season}-{episode}` so a
 * single dynamic route and a single push / deep-link URL can carry all three
 * ids (see build-episode-reminder-payload + deep-link-handler). Parsing lives
 * here, side-effect-free, so it's unit-tested independently of navigation.
 */

export interface EpisodeRoomCoords {
  tmdbId: number;
  season: number;
  episode: number;
}

/**
 * `1396-2-4` → { tmdbId: 1396, season: 2, episode: 4 }. Returns null on any
 * malformed part. Season is allowed to be 0 (TMDB specials); episode must be
 * >= 1 (there is no "episode 0" room to open).
 */
export function parseEpisodeRoomParam(
  raw: string | undefined | null
): EpisodeRoomCoords | null {
  if (!raw) return null;
  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const [tmdbId, season, episode] = parts.map((p) => Number(p));
  if (![tmdbId, season, episode].every(Number.isInteger)) return null;
  if (tmdbId <= 0 || season < 0 || episode < 1) return null;
  return { tmdbId, season, episode };
}

/** The room slug shared by the route, the push payload, and deep links. */
export function episodeRoomSlug(
  tmdbId: number,
  season: number,
  episode: number
): string {
  return `${tmdbId}-${season}-${episode}`;
}

/** `S2 · E4` — the header + chip label. */
export function formatEpisodeLabel(season: number, episode: number): string {
  return `S${season} · E${episode}`;
}

/** Compact `S2E4` label for the quiet prev/next nav buttons. */
export function formatEpisodeShort(season: number, episode: number): string {
  return `S${season}E${episode}`;
}

/**
 * Picks the torn-stub hero and the chronological ledger for a room.
 *
 * The hero is the take with the highest ENGAGEMENT (comment count for day-1 —
 * likes/reactions don't exist yet), tie-broken by newest-first. At zero/low
 * engagement this degrades to newest-first, so an empty or early room behaves
 * exactly as a plain chronological list. The ledger is the remaining takes in
 * their incoming (newest-first) order, with the hero removed so it never
 * appears twice.
 *
 * Deliberately isolated + order-independent so the ranking can later swap to an
 * engagement-with-recency-decay score (Reddit-hot style: engagement / age^k)
 * without touching the screen — only the compare below would change.
 * `engagement` and `createdAt` are accessors so this stays generic over the
 * room take shape.
 */
export function selectHeroTake<T>(
  takes: T[],
  engagement: (t: T) => number,
  createdAt: (t: T) => string | null
): { hero: T | null; rest: T[] } {
  if (takes.length === 0) return { hero: null, rest: [] };

  let heroIdx = 0;
  for (let i = 1; i < takes.length; i++) {
    const candEngagement = engagement(takes[i]);
    const bestEngagement = engagement(takes[heroIdx]);
    if (candEngagement > bestEngagement) {
      heroIdx = i;
    } else if (candEngagement === bestEngagement) {
      // Tie → newest wins. ISO timestamps compare lexicographically, so this
      // holds regardless of the incoming order.
      if ((createdAt(takes[i]) ?? '') > (createdAt(takes[heroIdx]) ?? '')) {
        heroIdx = i;
      }
    }
  }

  return {
    hero: takes[heroIdx],
    rest: takes.filter((_, i) => i !== heroIdx),
  };
}

/**
 * How many takes the room shows below the hero before collapsing behind the
 * "View all takes" affordance (Ty, 2026-07-19 — the room is a room, not an
 * endless feed).
 */
export const ROOM_LEDGER_CAP = 4;

/**
 * Popularity order for the room ledger and the view-all screen: engagement
 * descending, newest-first on ties — the same comparator the hero uses, so the
 * ledger reads as "the next most popular" rather than a second timeline.
 * Non-mutating.
 */
export function sortTakesByEngagement<T>(
  takes: T[],
  engagement: (t: T) => number,
  createdAt: (t: T) => string | null
): T[] {
  return [...takes].sort((a, b) => {
    const diff = engagement(b) - engagement(a);
    if (diff !== 0) return diff;
    // ISO timestamps compare lexicographically; missing dates sort last.
    return (createdAt(b) ?? '').localeCompare(createdAt(a) ?? '');
  });
}

// --- Episode-to-episode resolution (nav + continue-watching next-up) ---------
//
// The `mark_episode_watched` RPC records current_season/current_episode as the
// LAST WATCHED episode (ORDER BY season DESC, episode DESC LIMIT 1). These
// resolvers turn that coordinate — plus the aired-episode catalog TMDB gives us
// per season — into the NEXT-UP room to advance to, and the PREVIOUS one to
// cross back to, staying inside real (S >= 1), already-aired episodes. Kept pure
// and array-shaped (like selectHeroTake) so the boundary/aired/specials rules
// are unit-tested without a screen or a network. The client owns this entirely;
// the RPC and current_season/current_episode semantics are untouched.

export interface EpisodeAiredInfo {
  episodeNumber: number;
  /** TMDB air date `YYYY-MM-DD`, or null when TMDB has none. */
  airDate: string | null;
}

export interface EpisodeCoords {
  season: number;
  episode: number;
}

/** True when the episode is present with an air date on or before `today`. */
function isAired(
  episodes: EpisodeAiredInfo[],
  episodeNumber: number,
  today: string
): boolean {
  const ep = episodes.find((e) => e.episodeNumber === episodeNumber);
  return !!ep && ep.airDate != null && ep.airDate <= today;
}

/** Highest episode number in the season that has aired by `today` (0 if none). */
export function maxAiredEpisode(
  episodes: EpisodeAiredInfo[],
  today: string
): number {
  return episodes.reduce(
    (max, e) =>
      e.airDate != null && e.airDate <= today ? Math.max(max, e.episodeNumber) : max,
    0
  );
}

/**
 * The next aired episode after (season, episode), or null when the viewer is
 * caught up — or when the data needed to decide isn't loaded yet (the caller
 * treats both the same: show the last-watched coordinate, never blank).
 *
 * Same-season step: (S, E+1) when that episode exists in the season catalog and
 * has aired. If E+1 exists but hasn't aired, that's "caught up" → null (an
 * unaired premiere of a later season must never leapfrog an unaired same-season
 * episode). Boundary step: only when E is at/past the last episode the season
 * catalog carries does it cross to (S+1, 1), and only if that premiere has
 * aired. Specials are excluded from the CHAIN: a normal season never advances
 * into a season below 1, and this never crosses out of season 0 into 1.
 *
 * `currentSeasonEpisodes` null = current-season catalog not loaded.
 * `nextSeasonEpisodes` null = next-season catalog absent or not loaded (only
 * consulted at the boundary, so callers fetch it lazily).
 */
export function resolveNextUpEpisode(params: {
  season: number;
  episode: number;
  currentSeasonEpisodes: EpisodeAiredInfo[] | null;
  nextSeasonEpisodes: EpisodeAiredInfo[] | null;
  today: string;
}): EpisodeCoords | null {
  const { season, episode, currentSeasonEpisodes, nextSeasonEpisodes, today } = params;
  if (!currentSeasonEpisodes) return null;

  const nextInSeason = episode + 1;
  const existsInSeason = currentSeasonEpisodes.some(
    (e) => e.episodeNumber === nextInSeason
  );
  if (existsInSeason) {
    return isAired(currentSeasonEpisodes, nextInSeason, today)
      ? { season, episode: nextInSeason }
      : null;
  }

  // Past the last episode this season carries → cross a season boundary. Never
  // out of specials (season 0) into a real season via this chain.
  if (season < 1) return null;
  if (!nextSeasonEpisodes) return null;
  return isAired(nextSeasonEpisodes, 1, today)
    ? { season: season + 1, episode: 1 }
    : null;
}

/**
 * The previous episode room to cross back to, or null at the start of the
 * chain. Within a season it's simply (S, E-1) — reachable episodes are already
 * aired, so no air check is needed. At episode 1 of a real season (S >= 2) it
 * crosses back to the last aired episode of season S-1. Season 1 does NOT cross
 * into season 0 specials (S <= 1 → null).
 *
 * `prevSeasonEpisodes` null = previous-season catalog absent or not loaded
 * (only consulted at episode 1, so callers fetch it lazily).
 */
export function resolvePrevEpisode(params: {
  season: number;
  episode: number;
  prevSeasonEpisodes: EpisodeAiredInfo[] | null;
  today: string;
}): EpisodeCoords | null {
  const { season, episode, prevSeasonEpisodes, today } = params;
  if (episode > 1) return { season, episode: episode - 1 };
  // episode === 1 → cross back, but never into specials (season 0).
  if (season <= 1) return null;
  if (!prevSeasonEpisodes) return null;
  const lastAired = maxAiredEpisode(prevSeasonEpisodes, today);
  return lastAired >= 1 ? { season: season - 1, episode: lastAired } : null;
}

/**
 * Today as a LOCAL-timezone YYYY-MM-DD string for air-date comparisons.
 * `toISOString()` is UTC — for a US-evening user it has already rolled to
 * tomorrow, which would mark an episode airing tomorrow-local as aired a few
 * hours early (cold-review nit, PR #723).
 */
export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
