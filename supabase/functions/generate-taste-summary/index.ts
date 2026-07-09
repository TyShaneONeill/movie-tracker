import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { checkDailyAiSpend, logAiCost, buildSpendLimitResponse, AI_COST_ESTIMATES } from '../_shared/cost-tracking.ts';

/**
 * Taste Profile deep-dive (stats "Going deeper", vault PS-22 screen 3/4) —
 * the AI "read" backend. Mirrors generate-journey-art's auth/rate-limit/cost
 * shape, but the pipeline is: aggregate the user's watched movies → sample
 * TMDB credits for top director/studio → ask OpenAI for a short taste read
 * → cache both in taste_profile_cache (see the accompanying migration).
 *
 * Decade + comfort genre are cheap (already stored on user_movies) and are
 * ALSO computed client-side in lib/taste-profile.ts for instant, no-network
 * display — the copies here exist only to give the OpenAI prompt real
 * context. Edge functions can't import the RN app's lib/ (Deno isolation,
 * same reason get-tv-show-details/warm-release-calendar duplicate their own
 * small genre/constant tables instead of reaching into lib/tmdb.types.ts).
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OPENAI_MODEL = 'gpt-5-mini';

// Movies genre-only — matches lib/tmdb.types.ts TMDB_GENRE_MAP (duplicated
// here; Deno edge functions can't import the RN app's lib/, see file header).
const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

// A "read" needs at least this many logged movies to say anything honest.
const MIN_MOVIES_FOR_SUMMARY = 5;

// Cap on how many movies get a TMDB credits lookup (director/studio) — the
// aggregate is a sample of the user's most-recently-added movies, not the
// full library, to keep this function fast and TMDB-call-bounded.
const MAX_MOVIES_FOR_CREDITS = 100;

const MAX_DIRECTORS_RETURNED = 5;

interface UserMovieRow {
  tmdb_id: number;
  genre_ids: number[] | null;
  release_date: string | null;
  added_at: string;
}

interface TMDBCreditsResponse {
  credits?: {
    crew?: { job: string; name: string }[];
  };
  production_companies?: { name: string }[];
}

interface NameCount {
  name: string;
  count: number;
}

function topN(counts: Map<string, number>, n: number): NameCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function decadeLabel(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1800) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

function computeTopDecade(movies: UserMovieRow[]): string | null {
  const counts = new Map<string, number>();
  for (const m of movies) {
    const label = decadeLabel(m.release_date);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return topN(counts, 1)[0]?.name ?? null;
}

function computeComfortGenre(movies: UserMovieRow[]): string | null {
  const counts = new Map<string, number>();
  for (const m of movies) {
    for (const id of m.genre_ids ?? []) {
      const name = TMDB_GENRE_MAP[id];
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return topN(counts, 1)[0]?.name ?? null;
}

async function fetchCredits(tmdbId: number, apiKey: string): Promise<TMDBCreditsResponse | null> {
  try {
    const url = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// TMDB credits are fetched in small batches rather than one unbounded
// Promise.all over up to MAX_MOVIES_FOR_CREDITS ids — keeps us well clear of
// TMDB's rate limits on a user with a big library. Individual failures are
// silently skipped (fetchCredits returns null), not retried.
const CREDITS_BATCH_SIZE = 8;

async function computeDirectorsAndStudio(
  movies: UserMovieRow[],
  apiKey: string,
): Promise<{ topDirectors: NameCount[]; topStudio: string | null; creditsSampleSize: number }> {
  const sample = [...movies]
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, MAX_MOVIES_FOR_CREDITS);

  const results: (TMDBCreditsResponse | null)[] = [];
  for (let i = 0; i < sample.length; i += CREDITS_BATCH_SIZE) {
    const batch = sample.slice(i, i + CREDITS_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((m) => fetchCredits(m.tmdb_id, apiKey)));
    results.push(...batchResults);
  }

  const directorCounts = new Map<string, number>();
  const studioCounts = new Map<string, number>();
  let sampleSize = 0;

  for (const r of results) {
    if (!r) continue;
    sampleSize += 1;
    for (const crew of r.credits?.crew ?? []) {
      if (crew.job === 'Director' && crew.name) {
        directorCounts.set(crew.name, (directorCounts.get(crew.name) ?? 0) + 1);
      }
    }
    const primaryStudio = r.production_companies?.[0]?.name;
    if (primaryStudio) {
      studioCounts.set(primaryStudio, (studioCounts.get(primaryStudio) ?? 0) + 1);
    }
  }

  return {
    topDirectors: topN(directorCounts, MAX_DIRECTORS_RETURNED),
    topStudio: topN(studioCounts, 1)[0]?.name ?? null,
    creditsSampleSize: sampleSize,
  };
}

function buildPrompt(args: {
  topDirectors: NameCount[];
  topStudio: string | null;
  topDecade: string | null;
  comfortGenre: string | null;
  moviesAnalyzed: number;
}): string {
  const lines: string[] = [`Movies logged: ${args.moviesAnalyzed}`];
  if (args.topDirectors.length > 0) {
    lines.push(`Most-watched directors: ${args.topDirectors.map((d) => `${d.name} (${d.count})`).join(', ')}`);
  }
  if (args.topDecade) lines.push(`Favorite decade: ${args.topDecade}`);
  if (args.topStudio) lines.push(`Most-watched studio: ${args.topStudio}`);
  if (args.comfortGenre) lines.push(`Comfort genre: ${args.comfortGenre}`);
  return lines.join('\n');
}

async function generateTasteRead(aggregatesText: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are the voice of PocketStubs, a warm, cinephile-first movie diary app. ' +
              'Write a short "taste read" for a user based ONLY on the real aggregate stats ' +
              'given to you — never invent directors, titles, numbers, or facts not provided. ' +
              '2-3 sentences, second person ("you"), no bullet points, no emoji, no hedging.',
          },
          { role: 'user', content: aggregatesText },
        ],
        // max_completion_tokens (not max_tokens) — newer model families reject
        // the older param name. temperature omitted: newer families reject a
        // non-default value too, and the default is fine for this copy.
        //
        // Reasoning-family models (gpt-5-*) spend completion tokens on hidden
        // reasoning BEFORE emitting content — a tight cap gets fully consumed
        // by reasoning and returns EMPTY content with finish_reason "length"
        // (burned in prod 2026-07-09, first live call). reasoning_effort
        // "minimal" makes the model behave like a non-reasoning one (right for
        // 3-sentence copy) and the raised cap leaves headroom either way.
        max_completion_tokens: 1024,
        reasoning_effort: 'minimal',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      const finishReason = result.choices?.[0]?.finish_reason ?? 'unknown';
      throw new Error(`No summary returned from OpenAI (finish_reason: ${finishReason})`);
    }
    return content;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('OpenAI taste-summary request timed out after 20 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!OPENAI_API_KEY || !TMDB_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error('Missing API configuration - ensure OPENAI_API_KEY and TMDB_API_KEY are set');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Taste Profile is fully premium-gated (no free-tier trial, unlike
    // generate-journey-art) — the UI never mounts a real Regenerate control
    // for free users, but that's a client-side guard only. Defense in depth:
    // reject non-premium tiers here too, BEFORE the rate limit / movies query
    // / any TMDB or OpenAI spend. Mirrors lib/premium-service.ts's DB-tier
    // mapping ('plus'/'premium' legacy alias/'dev' = premium; anything else
    // is free).
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('account_tier')
      .eq('id', user.id)
      .maybeSingle();

    const accountTier = profile?.account_tier ?? 'free';
    const isPremiumTier = accountTier === 'plus' || accountTier === 'premium' || accountTier === 'dev';
    if (!isPremiumTier) {
      return new Response(
        JSON.stringify({ error: 'PocketStubs+ required for Taste Profile regeneration.' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const { data: movieRows, error: moviesError } = await supabaseAdmin
      .from('user_movies')
      .select('tmdb_id, genre_ids, release_date, added_at')
      .eq('user_id', user.id)
      .eq('status', 'watched');

    if (moviesError) {
      throw new Error(`Failed to load watched movies: ${moviesError.message}`);
    }

    const movies: UserMovieRow[] = movieRows ?? [];

    if (movies.length < MIN_MOVIES_FOR_SUMMARY) {
      return new Response(
        JSON.stringify({ error: 'Not enough movies logged yet for a taste read.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 5 regenerations per day (dev-tier bypass handled atomically
    // by check_rate_limit). Checked AFTER the min-movies threshold so a call
    // that was always going to 400 doesn't burn a daily token. Fail closed:
    // deny if DB is down to prevent unmetered OpenAI/TMDB spend.
    const rateLimited = await enforceRateLimit(user.id, 'taste_profile_summary', 5, 86400, req, { failClosed: true });
    if (rateLimited) return rateLimited;

    const spendCheck = await checkDailyAiSpend(supabaseAdmin);
    if (!spendCheck.allowed) {
      return buildSpendLimitResponse(req, spendCheck);
    }

    const topDecade = computeTopDecade(movies);
    const comfortGenre = computeComfortGenre(movies);
    const { topDirectors, topStudio, creditsSampleSize } = await computeDirectorsAndStudio(movies, TMDB_API_KEY);

    const aggregates = {
      topDirectors,
      topStudio,
      topDecade,
      comfortGenre,
      moviesAnalyzed: movies.length,
      creditsSampleSize,
    };

    const summary = await generateTasteRead(
      buildPrompt({ topDirectors, topStudio, topDecade, comfortGenre, moviesAnalyzed: movies.length }),
      OPENAI_API_KEY,
    );

    const generatedAt = new Date().toISOString();

    // Upsert NOT NULL gotcha: every NOT NULL column must be in the payload,
    // even though this is always an update-by-conflict on user_id (the PK).
    const { error: upsertError } = await supabaseAdmin
      .from('taste_profile_cache')
      .upsert({
        user_id: user.id,
        summary,
        aggregates,
        logs_count_at_generation: movies.length,
        generated_at: generatedAt,
      });

    if (upsertError) {
      throw new Error(`Failed to save taste profile: ${upsertError.message}`);
    }

    await logAiCost(supabaseAdmin, user.id, 'generate_taste_summary', OPENAI_MODEL, AI_COST_ESTIMATES[OPENAI_MODEL]);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        aggregates,
        generatedAt,
        logsCountAtGeneration: movies.length,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating taste summary:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
