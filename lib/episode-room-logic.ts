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
