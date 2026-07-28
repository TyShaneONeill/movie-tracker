/**
 * sync-tracked-show-metadata — make TV show metadata GUARANTEED, not incidental.
 *
 * # Why this exists
 *
 * `user_tv_shows.tmdb_status` / `number_of_seasons` / `number_of_episodes` and
 * the shared `tv_show_episodes` catalog were only ever populated as a SIDE
 * EFFECT of a user browsing — `lib/metadata-refresh.ts` runs opportunistically
 * on the client, and `get-season-episodes` upserts the catalog for whichever
 * season someone happened to open. Nothing guaranteed any row ever got them.
 *
 * Measured on production 2026-07-27, and this is the whole motivation:
 *
 *     tmdb_status IS NULL ................ 217 of 219 show rows
 *     zero episode-catalog rows .......... 118 of 194 distinct shows
 *     number_of_seasons IS NULL .......... 135 of 219 show rows
 *     number_of_episodes IS NULL ......... 121 of 194 distinct shows
 *
 * Three user-visible features read those columns and are therefore inert or
 * wrong for most shows today:
 *
 *   1. "Caught Up" (hooks/use-show-caught-up.ts) bails unless tmdb_status is
 *      non-null — so it never renders for ~99% of shows.
 *   2. The Ended-show auto-flip (check_and_flip_show_completion) requires
 *      tmdb_status IN ('Ended','Canceled') AND number_of_seasons NOT NULL, so
 *      it cannot fire for most shows. The client carries a "Legacy path"
 *      heuristic (hooks/use-episode-actions.ts:90) purely to compensate.
 *   3. Continue Watching progress needs number_of_episodes.
 *
 * Fixing the data fixes all three. Deriving a user-visible claim from
 * opportunistically-populated cache data was the original mistake; this
 * function is the correction.
 *
 * # Shape: bounded, staleness-ordered, resumable
 *
 * A full sweep is ~182 shows and ~850 TMDB calls — far too much for one
 * invocation's wall clock. So each run takes a BOUNDED batch of the stalest
 * shows and is fully idempotent. The cron is a dumb frequent heartbeat and the
 * QUERY owns which work is due — the same division that fixed the weekly-recap
 * cron (a cron that tries to be clever about scheduling is the thing that
 * breaks). Hourly × 25 shows converges the whole catalogue inside a day, then
 * settles into cheap no-op runs once everything is inside the staleness window.
 *
 * Per show: one /tv/{id} call plus one /tv/{id}/season/{n} call per season.
 * Season 0 (specials) is deliberately skipped so the catalog row count stays
 * comparable to TMDB's number_of_episodes, which also excludes specials — that
 * comparison is what any "do we have complete data for this show" check rests on.
 *
 * Fail-open per show: one bad TMDB response must not abort the batch.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/cron-auth.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/** Shows per invocation. Bounded by wall clock, not by TMDB limits. */
const DEFAULT_MAX_SHOWS = 25;
/** A show is due for refresh once its metadata is older than this. */
const DEFAULT_STALE_HOURS = 24;
/**
 * Ended/Canceled shows get a much longer window. Their episode list is frozen —
 * re-pulling every season of a show that finished in 2013 is pure waste. The
 * only reason to revisit them at all is a TMDB correction, which is rare enough
 * that weekly is generous.
 */
const ENDED_STALE_HOURS = 24 * 7;
/** Concurrent season fetches within one show. Polite to TMDB, still quick. */
const SEASON_CONCURRENCY = 4;
/** Breather between shows so a batch never bursts. */
const SHOW_DELAY_MS = 120;
/**
 * Air dates near "now" still move (a TBA episode gets scheduled, a slot slips),
 * so a season containing anything unaired or freshly-aired stays volatile and is
 * refetched even when its episode COUNT is unchanged. Seasons entirely older
 * than this are treated as settled.
 */
const VOLATILE_WINDOW_DAYS = 7;

interface RequestBody {
  max_shows?: number;
  stale_hours?: number;
  /** Refresh regardless of staleness — for the first full backfill. */
  force?: boolean;
}

interface TMDBSeasonSummary {
  season_number: number;
  episode_count: number;
}

interface TMDBShowDetail {
  id: number;
  status: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  seasons?: TMDBSeasonSummary[];
}

interface TMDBEpisode {
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number | null;
  vote_count: number | null;
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const authError = requireServiceRole(req);
  if (authError) return authError;

  const corsHeaders = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // pg_cron may post an empty body; defaults apply.
    }
    const maxShows = Math.max(1, Math.min(body.max_shows ?? DEFAULT_MAX_SHOWS, 100));
    const staleHours = body.stale_hours ?? DEFAULT_STALE_HOURS;
    const force = body.force === true;

    // Which shows are due? Selected across ALL users — the catalog is shared, so
    // one refresh serves every user tracking that show. Nulls first: a show that
    // has never been refreshed is the worst case and should go to the front.
    const cutoffIso = new Date(Date.now() - staleHours * 3600 * 1000).toISOString();
    const endedCutoffIso = new Date(Date.now() - ENDED_STALE_HOURS * 3600 * 1000).toISOString();
    let query = supabase
      .from('user_tv_shows')
      .select('tmdb_id, metadata_refreshed_at, tmdb_status')
      .not('tmdb_id', 'is', null)
      .order('metadata_refreshed_at', { ascending: true, nullsFirst: true })
      .limit(maxShows * 8); // over-fetch: many rows collapse to few distinct shows

    if (!force) {
      query = query.or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`);
    }

    const { data: rows, error: selectError } = await query;
    if (selectError) throw new Error(`show select failed: ${selectError.message}`);

    // Collapse to distinct tmdb_ids, preserving the staleness ordering above.
    // A show already known to be Ended/Canceled is held back to the weekly
    // cadence: its catalog is frozen, so spending a daily slot on it displaces a
    // returning series that might actually have a new episode.
    const dueShowIds: number[] = [];
    const seen = new Set<number>();
    for (const row of rows ?? []) {
      const r = row as { tmdb_id: number; metadata_refreshed_at: string | null; tmdb_status: string | null };
      if (seen.has(r.tmdb_id)) continue;

      const isFinished = r.tmdb_status === 'Ended' || r.tmdb_status === 'Canceled';
      if (!force && isFinished && r.metadata_refreshed_at !== null && r.metadata_refreshed_at >= endedCutoffIso) {
        continue;
      }

      seen.add(r.tmdb_id);
      dueShowIds.push(r.tmdb_id);
      if (dueShowIds.length >= maxShows) break;
    }

    const summary = {
      shows_due: dueShowIds.length,
      shows_synced: 0,
      shows_failed: 0,
      episodes_upserted: 0,
      // Season fetches avoided by the change-detection above. Reported so the
      // saving is observable rather than assumed — if this stops being large in
      // steady state, the detection has regressed.
      season_calls_made: 0,
      season_calls_skipped: 0,
      failures: [] as { tmdb_id: number; reason: string }[],
    };

    for (const tmdbId of dueShowIds) {
      try {
        // --- 1. show-level metadata -------------------------------------
        const showUrl = new URL(`${TMDB_BASE_URL}/tv/${tmdbId}`);
        showUrl.searchParams.set('api_key', TMDB_API_KEY);
        const showRes = await fetch(showUrl.toString());
        if (!showRes.ok) {
          throw new Error(`TMDB /tv/${tmdbId} -> ${showRes.status}`);
        }
        const show = (await showRes.json()) as TMDBShowDetail;

        // --- 2. work out which seasons can actually have changed ---------
        // The single /tv/{id} call above already carries seasons[].episode_count,
        // so it tells us what to refetch without spending a call to find out.
        // A season is refetched only when:
        //   (a) our stored episode count disagrees with TMDB's — episodes were
        //       added or removed; or
        //   (b) it holds anything unaired or freshly aired, where dates still
        //       move even though the count does not.
        // Everything else is settled: a finished season of a finished show is
        // immutable, and re-pulling it daily is work with no possible result.
        const allSeasons = (show.seasons ?? [])
          .map((s) => s.season_number)
          .filter((n) => typeof n === 'number' && n > 0);
        if (allSeasons.length === 0 && show.number_of_seasons) {
          for (let n = 1; n <= show.number_of_seasons; n++) allSeasons.push(n);
        }
        const tmdbCountBySeason = new Map<number, number>();
        for (const s of show.seasons ?? []) {
          if (s.season_number > 0) tmdbCountBySeason.set(s.season_number, s.episode_count);
        }

        // What we already hold, per season: how many rows, and whether any of
        // them are still moving.
        const volatileCutoff = new Date(Date.now() - VOLATILE_WINDOW_DAYS * 86400_000)
          .toISOString()
          .slice(0, 10);
        const { data: storedRows } = await supabase
          .from('tv_show_episodes')
          .select('season_number, air_date')
          .eq('tmdb_show_id', tmdbId);

        const storedCount = new Map<number, number>();
        const volatileSeasons = new Set<number>();
        for (const r of (storedRows ?? []) as { season_number: number; air_date: string | null }[]) {
          storedCount.set(r.season_number, (storedCount.get(r.season_number) ?? 0) + 1);
          if (r.air_date === null || r.air_date >= volatileCutoff) {
            volatileSeasons.add(r.season_number);
          }
        }

        const seasonNumbers = allSeasons.filter((n) => {
          const stored = storedCount.get(n) ?? 0;
          if (stored === 0) return true; // never fetched
          if (stored !== (tmdbCountBySeason.get(n) ?? stored)) return true; // count moved
          return volatileSeasons.has(n); // dates may still move
        });

        const seasonsSkipped = allSeasons.length - seasonNumbers.length;
        let episodesForShow = 0;
        await runWithLimit(seasonNumbers, SEASON_CONCURRENCY, async (seasonNumber) => {
          const seasonUrl = new URL(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}`);
          seasonUrl.searchParams.set('api_key', TMDB_API_KEY);
          const seasonRes = await fetch(seasonUrl.toString());
          if (!seasonRes.ok) return; // a missing season must not fail the show

          const seasonData = (await seasonRes.json()) as { episodes?: TMDBEpisode[] };
          const episodes = seasonData.episodes ?? [];
          if (episodes.length === 0) return;

          const catalogRows = episodes.map((ep) => ({
            tmdb_show_id: tmdbId,
            season_number: seasonNumber,
            episode_number: ep.episode_number,
            name: ep.name || null,
            overview: ep.overview || null,
            air_date: ep.air_date || null,
            runtime: ep.runtime,
            still_path: ep.still_path,
            tmdb_vote_average: ep.vote_average,
            tmdb_vote_count: ep.vote_count,
            refreshed_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabase
            .from('tv_show_episodes')
            .upsert(catalogRows, { onConflict: 'tmdb_show_id,season_number,episode_number' });

          if (upsertError) {
            console.warn(`[sync] catalog upsert ${tmdbId} s${seasonNumber}: ${upsertError.message}`);
            return;
          }
          episodesForShow += catalogRows.length;
        });

        // --- 3. stamp every user's row for this show --------------------
        // metadata_refreshed_at is written LAST and only on success, so a run
        // that dies partway leaves the show still "due" rather than silently
        // marking it fresh with a half-written catalog.
        const { error: updateError } = await supabase
          .from('user_tv_shows')
          .update({
            tmdb_status: show.status ?? null,
            number_of_seasons: show.number_of_seasons ?? null,
            number_of_episodes: show.number_of_episodes ?? null,
            metadata_refreshed_at: new Date().toISOString(),
          })
          .eq('tmdb_id', tmdbId);

        if (updateError) throw new Error(`show update failed: ${updateError.message}`);

        summary.shows_synced += 1;
        summary.episodes_upserted += episodesForShow;
        summary.season_calls_made += seasonNumbers.length;
        summary.season_calls_skipped += seasonsSkipped;
      } catch (err) {
        summary.shows_failed += 1;
        const reason = err instanceof Error ? err.message : String(err);
        summary.failures.push({ tmdb_id: tmdbId, reason });
        console.warn(`[sync] show ${tmdbId} failed: ${reason}`);
      }

      if (SHOW_DELAY_MS > 0) await new Promise((r) => setTimeout(r, SHOW_DELAY_MS));
    }

    console.log(`[sync] ${JSON.stringify(summary)}`);
    return new Response(JSON.stringify(summary), { headers: corsHeaders, status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-tracked-show-metadata] fatal:', message);
    return new Response(JSON.stringify({ error: message }), { headers: corsHeaders, status: 500 });
  }
});
