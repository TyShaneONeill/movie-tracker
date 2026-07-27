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
/** Concurrent season fetches within one show. Polite to TMDB, still quick. */
const SEASON_CONCURRENCY = 4;
/** Breather between shows so a batch never bursts. */
const SHOW_DELAY_MS = 120;

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
    let query = supabase
      .from('user_tv_shows')
      .select('tmdb_id, metadata_refreshed_at')
      .not('tmdb_id', 'is', null)
      .order('metadata_refreshed_at', { ascending: true, nullsFirst: true })
      .limit(maxShows * 8); // over-fetch: many rows collapse to few distinct shows

    if (!force) {
      query = query.or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`);
    }

    const { data: rows, error: selectError } = await query;
    if (selectError) throw new Error(`show select failed: ${selectError.message}`);

    // Collapse to distinct tmdb_ids, preserving the staleness ordering above.
    const dueShowIds: number[] = [];
    const seen = new Set<number>();
    for (const row of rows ?? []) {
      const id = (row as { tmdb_id: number }).tmdb_id;
      if (!seen.has(id)) {
        seen.add(id);
        dueShowIds.push(id);
        if (dueShowIds.length >= maxShows) break;
      }
    }

    const summary = {
      shows_due: dueShowIds.length,
      shows_synced: 0,
      shows_failed: 0,
      episodes_upserted: 0,
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

        // --- 2. full episode catalog, seasons 1..N ----------------------
        // Prefer the seasons array (authoritative about which exist); fall back
        // to a 1..number_of_seasons range if TMDB omits it.
        const seasonNumbers = (show.seasons ?? [])
          .map((s) => s.season_number)
          .filter((n) => typeof n === 'number' && n > 0);
        if (seasonNumbers.length === 0 && show.number_of_seasons) {
          for (let n = 1; n <= show.number_of_seasons; n++) seasonNumbers.push(n);
        }

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
