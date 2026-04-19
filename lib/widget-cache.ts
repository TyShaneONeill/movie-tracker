import { supabase } from '@/lib/supabase';
import { writeWidgetData, writePosterFile, reloadWidgetTimelines, WidgetPayload } from '@/lib/widget-bridge';
import type { SeasonDetailResponse } from '@/lib/tmdb.types';

type WatchingRow = {
  user_tv_show_id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  current_season: number;
  current_episode: number;
  number_of_seasons: number;
  updated_at: string;
};

type BuildInput = {
  rows: WatchingRow[];
  stats: { films_watched: number; shows_watched: number };
  episodesBySeason: Record<string, number>; // key format: `${userTvShowId}-${seasonNumber}`. In Phase 1 this is ALWAYS {}.
  liveNumberOfSeasons: Record<string, number>; // NEW (Phase 3): userTvShowId → live N from TMDB
};

function extractEpisodesBySeasonForShow(
  userTvShowId: string,
  episodesBySeason: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const prefix = `${userTvShowId}-`;
  for (const [key, value] of Object.entries(episodesBySeason)) {
    if (key.startsWith(prefix)) {
      out[key.substring(prefix.length)] = value;
    }
  }
  return out;
}

/**
 * Phase 3: fetch live TMDB number_of_seasons for each top-3 show.
 * Overrides the DB's user_tv_shows.number_of_seasons value which may be
 * stale (set at show-add time, not refreshed when TMDB adds new seasons).
 *
 * Inlined supabase.functions.invoke call rather than importing from
 * tv-show-service.ts to avoid a circular dependency (tv-show-service
 * already imports from this file).
 *
 * Per-show failure is silent — caller falls back to row.number_of_seasons.
 */
async function fetchShowDetails(rows: WatchingRow[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const top3 = rows.slice(0, 3);

  await Promise.all(
    top3.map(async (row) => {
      try {
        const { data, error } = await supabase.functions.invoke<{ number_of_seasons?: number }>(
          'get-tv-show-details',
          { body: { showId: row.tmdb_id } }
        );
        if (error || !data) return;
        if (typeof data.number_of_seasons === 'number' && data.number_of_seasons > 0) {
          map[row.user_tv_show_id] = data.number_of_seasons;
        }
      } catch (err) {
        if (__DEV__) console.warn('[widget-cache] TMDB show-details fetch failed', {
          tmdb_id: row.tmdb_id,
          err,
        });
      }
    })
  );

  return map;
}

async function fetchSeasonEpisodeCounts(rows: WatchingRow[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const top3 = rows.slice(0, 3);

  // Build list of (row, seasonNumber) pairs to fetch, then fetch in parallel.
  // Calls the same Supabase edge function that getSeasonEpisodes in tv-show-service uses,
  // but inlined here to avoid a circular import (tv-show-service imports widget-cache).
  const fetches: Array<Promise<void>> = [];
  for (const row of top3) {
    for (let seasonNum = 1; seasonNum <= row.number_of_seasons; seasonNum++) {
      fetches.push(
        supabase.functions
          .invoke<SeasonDetailResponse>('get-season-episodes', {
            body: { showId: row.tmdb_id, seasonNumber: seasonNum },
          })
          .then(({ data, error }) => {
            if (error || !data) throw error ?? new Error('No data');
            map[`${row.user_tv_show_id}-${seasonNum}`] = data.episodes?.length ?? 0;
          })
          .catch((err) => {
            if (__DEV__) console.warn('[widget-cache] TMDB season fetch failed', {
              tmdb_id: row.tmdb_id,
              seasonNum,
              err,
            });
            // Leave unset; is_season_complete defaults to false and widget renders correctly
          })
      );
    }
  }
  await Promise.all(fetches);
  return map;
}

export function buildWidgetPayload({ rows, stats, episodesBySeason, liveNumberOfSeasons }: BuildInput): WidgetPayload {
  const top3 = rows
    .slice()
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 3);

  const shows = top3.map((row, idx) => {
    const episodesInSeason = episodesBySeason[`${row.user_tv_show_id}-${row.current_season}`] ?? 0;
    const isSeasonComplete = episodesInSeason > 0 && row.current_episode >= episodesInSeason;
    // Prefer live TMDB number_of_seasons; fall back to DB row if missing
    const effectiveTotalSeasons =
      liveNumberOfSeasons[row.user_tv_show_id] ?? row.number_of_seasons;
    const hasNextSeason = row.current_season < effectiveTotalSeasons;
    const isShowComplete = isSeasonComplete && !hasNextSeason;
    return {
      user_tv_show_id: row.user_tv_show_id,
      tmdb_id: row.tmdb_id,
      name: row.name,
      poster_filename: row.poster_path ? `poster_${idx}.jpg` : null,
      current_season: row.current_season,
      current_episode: row.current_episode,
      total_seasons: effectiveTotalSeasons,
      total_episodes_in_current_season: episodesInSeason > 0 ? episodesInSeason : null,
      episodes_by_season: extractEpisodesBySeasonForShow(row.user_tv_show_id, episodesBySeason),
      is_season_complete: isSeasonComplete,
      has_next_season: hasNextSeason,
      next_season_number: hasNextSeason ? row.current_season + 1 : null,
      is_show_complete: isShowComplete,
    };
  });

  return {
    version: 1,
    cached_at: Date.now(),
    stats,
    shows,
  };
}

const MAX_POSTER_BYTES = 500_000; // TMDB w342 posters are ~30KB; cap at 500KB to prevent memory spikes from a compromised mirror
const TMDB_POSTER_PATH_PATTERN = /^\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i;

/**
 * Writes an empty payload to the App Groups cache and reloads widget timelines.
 * Call on sign-out to prevent the widget from showing a previous user's shows.
 */
export async function clearWidgetCache(): Promise<void> {
  const emptyPayload: WidgetPayload = {
    version: 1,
    cached_at: Date.now(),
    stats: { films_watched: 0, shows_watched: 0 },
    shows: [],
  };
  await writeWidgetData(emptyPayload);
  await reloadWidgetTimelines();
}

export async function syncWidgetCache(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // No authed user - clear any cached data from a previous session
    await clearWidgetCache();
    return;
  }

  // Query top shows the user is currently watching (oversample in case some get filtered later)
  const { data: tvRows, error: tvErr } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, current_season, current_episode, number_of_seasons, updated_at')
    .eq('user_id', user.id)
    .eq('status', 'watching')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (tvErr || !tvRows) return;

  const rows: WatchingRow[] = tvRows.map((r) => ({
    user_tv_show_id: r.id,
    tmdb_id: r.tmdb_id,
    name: r.name,
    poster_path: r.poster_path,
    current_season: r.current_season ?? 1,
    current_episode: r.current_episode ?? 1,
    number_of_seasons: r.number_of_seasons ?? 1,
    updated_at: r.updated_at ?? new Date(0).toISOString(),
  }));

  // Phase 2: fetch per-season episode counts via the TMDB edge function for
  // the top 3 watching shows. All seasons are fetched so the widget can
  // handle season-advance (StartNextSeasonIntent) locally.
  // Failures are non-fatal — affected flags default to false, widget still renders.
  const top3ForFetch = rows
    .slice()
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 3);
  // Phase 3: also fetch show-level details for live number_of_seasons
  // (fixes Start S{N+1} on airing shows where DB is stale)
  const [episodesBySeason, liveNumberOfSeasons] = await Promise.all([
    fetchSeasonEpisodeCounts(top3ForFetch),
    fetchShowDetails(top3ForFetch),
  ]);

  // Stats counts
  const [filmsRes, showsRes] = await Promise.all([
    supabase
      .from('user_movies')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'watched'),
    supabase
      .from('user_tv_shows')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['watched', 'watching']),
  ]);

  const payload = buildWidgetPayload({
    rows,
    stats: {
      films_watched: filmsRes.count ?? 0,
      shows_watched: showsRes.count ?? 0,
    },
    episodesBySeason,
    liveNumberOfSeasons,
  });

  // Download and write posters for the top 3 shows that actually make the cut
  for (let i = 0; i < payload.shows.length; i++) {
    const show = payload.shows[i];
    const row = rows.find((r) => r.user_tv_show_id === show.user_tv_show_id);
    if (!row?.poster_path) continue;
    // Sanitize poster_path - TMDB paths are a leading slash + safe filename. Rejects anything that could
    // alter the URL (path traversal, embedded schemes, whitespace, etc).
    if (!TMDB_POSTER_PATH_PATTERN.test(row.poster_path)) continue;
    const url = `https://image.tmdb.org/t/p/w342${row.poster_path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const contentLength = Number(res.headers.get('content-length') ?? 0);
      if (contentLength > MAX_POSTER_BYTES) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_POSTER_BYTES) continue;
      const base64 = arrayBufferToBase64(buf);
      await writePosterFile(`poster_${i}.jpg`, base64);
    } catch (err) {
      if (__DEV__) console.warn('[widget-cache] poster download failed', err);
      // Cache JSON will still reference `poster_${i}.jpg` — widget will show fallback when file is missing
    }
  }

  await writeWidgetData(payload);
  await reloadWidgetTimelines();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
