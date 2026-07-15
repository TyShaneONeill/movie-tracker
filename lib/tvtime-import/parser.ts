import Papa from 'papaparse';
import type {
  ParsedEpisode,
  ParsedMovie,
  ParsedShow,
  ParsedTvTimePayload,
  TvTimeFileMap,
} from './types';

// TV Time GDPR export filenames (verified against a real export).
const FILE_SHOWS = 'tracking-prod-records-v2.csv';
const FILE_MOVIES = 'tracking-prod-records.csv';
const FILE_SHOW_SUMMARY = 'user_tv_show_data.csv';

/** Row shape of `tracking-prod-records-v2.csv` (shows + episodes). */
interface ShowRow {
  created_at?: string;
  is_followed?: string;
  s_id?: string; // TheTVDB series id
  ep_id?: string; // TheTVDB episode id
  s_no?: string;
  ep_no?: string;
  season_number?: string;
  episode_number?: string;
  series_name?: string;
}

/** Row shape of `tracking-prod-records.csv` (older format, movies). */
interface MovieRow {
  uuid?: string;
  type?: string; // follow | towatch | watch | time-count | ...
  entity_type?: string; // 'movie' for the rows we keep
  movie_name?: string;
  release_date?: string;
  rewatch_count?: string;
  created_at?: string;
}

/** Row shape of `user_tv_show_data.csv` (per-show crosscheck). */
interface ShowSummaryRow {
  tv_show_id?: string; // TheTVDB series id
  is_favorited?: string;
}

/** Match an export file by basename, tolerant of nested paths in the ZIP. */
function findFile(files: TvTimeFileMap, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(files)) {
    const base = key.split('/').pop()?.toLowerCase();
    if (base === target) return files[key];
  }
  return undefined;
}

/** `2002-12-06 00:00:00` / `2002-12-06T…` → `2002-12-06`. Empty → null. */
function toDateOnly(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.split(/[ T]/)[0];
}

function toInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function parseCsv<T>(content: string): T[] {
  const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true });
  return result.data;
}

/**
 * Parse a TV Time GDPR export into a normalized payload.
 *
 * Pure and defensive: tolerates missing files (movies-only / shows-only ZIPs),
 * duplicate rows (episodes deduped by TVDB episode id, movies by uuid), and
 * malformed rows (skipped and recorded in `warnings` — never throws on a bad row).
 *
 * @param files filename → raw CSV content (the UI layer unzips first).
 */
export function parseTvTimeExport(files: TvTimeFileMap): ParsedTvTimePayload {
  const warnings: string[] = [];
  const shows = parseShows(files, warnings);
  const movies = parseMovies(files, warnings);
  return { shows, movies, warnings };
}

function parseShows(files: TvTimeFileMap, warnings: string[]): ParsedShow[] {
  const content = findFile(files, FILE_SHOWS);
  if (!content) return [];

  // Keyed by TVDB series id so follow rows and episode rows converge.
  const byTvdbId = new Map<number, ParsedShow>();
  const seenEpisodes = new Map<number, Set<number>>();

  const ensureShow = (tvdbId: number, name: string): ParsedShow => {
    let show = byTvdbId.get(tvdbId);
    if (!show) {
      show = { tvdbId, name: name.trim(), followed: false, favorited: false, episodes: [] };
      byTvdbId.set(tvdbId, show);
      seenEpisodes.set(tvdbId, new Set());
    } else if (!show.name && name.trim()) {
      show.name = name.trim();
    }
    return show;
  };

  for (const row of parseCsv<ShowRow>(content)) {
    const tvdbId = toInt(row.s_id);
    // Aggregate / stats rows have a blank series id — skip silently.
    if (tvdbId === null) continue;

    const epRaw = row.ep_id?.trim();
    if (epRaw) {
      // Per-episode watch row.
      const tvdbEpisodeId = toInt(row.ep_id);
      const season = toInt(row.season_number) ?? toInt(row.s_no);
      const episode = toInt(row.episode_number) ?? toInt(row.ep_no);
      if (tvdbEpisodeId === null || season === null || episode === null) {
        warnings.push(
          `Skipped malformed episode row for series ${tvdbId} (ep_id="${row.ep_id ?? ''}", s_no="${row.s_no ?? ''}", ep_no="${row.ep_no ?? ''}")`
        );
        continue;
      }
      const show = ensureShow(tvdbId, row.series_name ?? '');
      const seen = seenEpisodes.get(tvdbId)!;
      if (seen.has(tvdbEpisodeId)) continue; // dedupe duplicate rows
      seen.add(tvdbEpisodeId);
      const ep: ParsedEpisode = {
        tvdbEpisodeId,
        season,
        episode,
        watchedAt: row.created_at?.trim() || null,
      };
      show.episodes.push(ep);
      continue;
    }

    if (row.is_followed?.trim() === 'true') {
      // Follow row: carries the show name + follow flag.
      ensureShow(tvdbId, row.series_name ?? '').followed = true;
    }
    // Any other row with a series id but no episode / follow signal is ignored.
  }

  applyFavorites(files, byTvdbId, warnings);
  return [...byTvdbId.values()];
}

/** Overlay `is_favorited` from the crosscheck file when present. */
function applyFavorites(
  files: TvTimeFileMap,
  byTvdbId: Map<number, ParsedShow>,
  warnings: string[]
): void {
  const content = findFile(files, FILE_SHOW_SUMMARY);
  if (!content) return;
  for (const row of parseCsv<ShowSummaryRow>(content)) {
    const tvdbId = toInt(row.tv_show_id);
    if (tvdbId === null) continue;
    const show = byTvdbId.get(tvdbId);
    if (show) show.favorited = row.is_favorited?.trim() === '1';
  }
  void warnings;
}

function parseMovies(files: TvTimeFileMap, warnings: string[]): ParsedMovie[] {
  const content = findFile(files, FILE_MOVIES);
  if (!content) return [];

  // Group rows by uuid — the same movie appears as follow / towatch / watch rows.
  interface MovieAcc {
    title: string;
    releaseDate: string | null;
    watched: boolean;
    watchedAt: string | null;
    rewatchCount: number;
  }
  const byUuid = new Map<string, MovieAcc>();

  for (const row of parseCsv<MovieRow>(content)) {
    // Keep only movie entities; skip time-count / count-watch / blank rows.
    if (row.entity_type?.trim() !== 'movie') continue;

    const uuid = row.uuid?.trim();
    const title = row.movie_name?.trim();
    if (!uuid || !title) {
      warnings.push(
        `Skipped malformed movie row (uuid="${row.uuid ?? ''}", movie_name="${row.movie_name ?? ''}")`
      );
      continue;
    }

    const type = row.type?.trim();
    let acc = byUuid.get(uuid);
    if (!acc) {
      acc = { title, releaseDate: toDateOnly(row.release_date), watched: false, watchedAt: null, rewatchCount: 0 };
      byUuid.set(uuid, acc);
    }
    if (!acc.releaseDate) acc.releaseDate = toDateOnly(row.release_date);

    if (type === 'watch') {
      // Watched wins over towatch; the watch row carries the authoritative
      // watch timestamp + rewatch count.
      acc.watched = true;
      acc.watchedAt = row.created_at?.trim() || null;
      acc.rewatchCount = toInt(row.rewatch_count) ?? acc.rewatchCount;
    }
  }

  return [...byUuid.values()].map((acc) => ({
    title: acc.title,
    releaseDate: acc.releaseDate,
    status: acc.watched ? 'watched' : 'watchlist',
    watchedAt: acc.watched ? acc.watchedAt : null,
    rewatchCount: acc.rewatchCount,
  }));
}
