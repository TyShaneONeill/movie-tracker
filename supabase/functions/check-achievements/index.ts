import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { computeRevocations, type StatSnapshot } from './reconciliation.ts';

// Simple deterministic hash (FNV-1a variant) — produces a positive 32-bit int
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria_type: string;
  criteria_value: number;
}

interface AchievementLevel {
  id: string;
  achievement_id: string;
  level: number;
  criteria_value: number;
  description: string;
}

interface AwardedAchievement {
  achievement: Achievement;
  level: number;
  level_description: string;
  unlocked_at: string;
}

interface RevokedAchievementLevel {
  achievement_id: string;
  level: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 30 requests per hour per user
    const rateLimited = await enforceRateLimit(user.id, 'check_achievements', 30, 3600, req);
    if (rateLimited) return rateLimited;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const userId = user.id;

    // 1. Fetch all achievement definitions and their levels
    const [achievementsResult, levelsResult] = await Promise.all([
      supabaseAdmin.from('achievements').select('*').order('sort_order'),
      supabaseAdmin.from('achievement_levels').select('*').order('level'),
    ]);

    if (achievementsResult.error) throw new Error(`Failed to fetch achievements: ${achievementsResult.error.message}`);
    if (levelsResult.error) throw new Error(`Failed to fetch achievement levels: ${levelsResult.error.message}`);

    const achievements: Achievement[] = achievementsResult.data ?? [];
    const allLevels: AchievementLevel[] = levelsResult.data ?? [];

    // 2. Fetch user's already-earned achievement levels
    const { data: earnedRaw, error: earnedError } = await supabaseAdmin
      .from('user_achievements')
      .select('achievement_id, level')
      .eq('user_id', userId);

    if (earnedError) throw new Error(`Failed to fetch earned achievements: ${earnedError.message}`);

    // Build map: achievement_id → max earned level (0 if none)
    const earnedMaxLevel = new Map<string, number>();
    for (const row of (earnedRaw || [])) {
      const current = earnedMaxLevel.get(row.achievement_id) ?? 0;
      if (row.level > current) earnedMaxLevel.set(row.achievement_id, row.level);
    }

    // Group levels by achievement_id
    const levelsByAchievement = new Map<string, AchievementLevel[]>();
    for (const lvl of allLevels) {
      if (!levelsByAchievement.has(lvl.achievement_id)) {
        levelsByAchievement.set(lvl.achievement_id, []);
      }
      levelsByAchievement.get(lvl.achievement_id)!.push(lvl);
    }

    // 3. Fetch user stats for criteria evaluation
    const [watchedResult, firstTakesResult, genresResult, nightOwlResult, tvResult, reviewsResult] = await Promise.all([
      supabaseAdmin
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'watched'),
      supabaseAdmin
        .from('first_takes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .like('quote_text', '_%'),
      supabaseAdmin
        .from('user_movies')
        .select('genre_ids')
        .eq('user_id', userId)
        .eq('status', 'watched')
        .not('genre_ids', 'is', null),
      supabaseAdmin
        .from('user_movies')
        .select('watch_time')
        .eq('user_id', userId)
        .eq('status', 'watched')
        .not('watch_time', 'is', null),
      supabaseAdmin
        .from('user_tv_shows')
        .select('status, episodes_watched, number_of_episodes, number_of_seasons, genre_ids')
        .eq('user_id', userId),
      supabaseAdmin
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        // Quiet TV Time import-deck ratings (source='tvtime_import') are wordless
        // backfilled ratings — they must not unlock the Critic achievement. Count
        // only organically authored reviews. See 20260715090000_tvtime_deck_quiet_ratings.
        .eq('source', 'manual'),
    ]);

    // Availability of each underlying query — a stat is only "available"
    // when its query succeeded outright. Count queries (head:true) return a
    // null count on error/timeout; data queries return null data. Treat
    // anything short of that success shape as unavailable, never as 0 — an
    // unavailable stat must never be able to drive a revocation (see
    // reconciliation.ts SAFETY note).
    const watchedAvailable = !watchedResult.error && watchedResult.count !== null;
    const firstTakesAvailable = !firstTakesResult.error && firstTakesResult.count !== null;
    const genresAvailable = !genresResult.error && genresResult.data !== null;
    const nightOwlAvailable = !nightOwlResult.error && nightOwlResult.data !== null;
    const tvAvailable = !tvResult.error && tvResult.data !== null;
    const reviewsAvailable = !reviewsResult.error && reviewsResult.count !== null;

    const watchedCount = watchedResult.count ?? 0;
    const firstTakesCount = firstTakesResult.count ?? 0;

    // Count distinct movie genres
    const genreSet = new Set<number>();
    if (genresResult.data) {
      for (const movie of genresResult.data) {
        if (movie.genre_ids && Array.isArray(movie.genre_ids)) {
          for (const genreId of movie.genre_ids) genreSet.add(genreId);
        }
      }
    }
    const genreCount = genreSet.size;

    // TV stats
    const tvShows = tvResult.data ?? [];
    const completedShows = tvShows.filter(s =>
      s.episodes_watched != null &&
      s.number_of_episodes != null &&
      s.number_of_episodes > 0 &&
      s.episodes_watched >= s.number_of_episodes
    );
    const tvWatchedCount = tvShows.filter(s => s.status === 'watched').length;
    const tvEpisodesCount = tvShows.reduce((sum, s) => sum + (s.episodes_watched ?? 0), 0);
    const tvCompletedCount = completedShows.length;
    const tvSeasonsCount = completedShows.reduce((sum, s) => sum + (s.number_of_seasons ?? 1), 0);
    const tvGenreSet = new Set<number>();
    for (const show of tvShows) {
      if (show.genre_ids && Array.isArray(show.genre_ids)) {
        for (const id of show.genre_ids) tvGenreSet.add(id);
      }
    }
    const tvGenreCount = tvGenreSet.size;

    // Night owl: count of movies explicitly logged between midnight and 5 AM.
    // Only uses watch_time (user-set HH:MM) — never falls back to watched_at,
    // which defaults to midnight UTC for date-only entries and is unreliable.
    let nightOwlCount = 0;
    if (nightOwlResult.data) {
      for (const movie of nightOwlResult.data) {
        const hour = parseInt(movie.watch_time.split(':')[0], 10);
        if (hour >= 0 && hour < 5) nightOwlCount++;
      }
    }

    // Reviews count (for Critic achievement)
    const reviewsCount = reviewsResult.count ?? 0;

    // Helper: return the user's current stat value for a given criteria type
    function getStatValue(criteriaType: string): number {
      switch (criteriaType) {
        case 'watched_count':      return watchedCount;
        case 'first_take_count':   return firstTakesCount;
        case 'night_owl':          return nightOwlCount;
        case 'genre_count':        return genreCount;
        case 'tv_watched_count':   return tvWatchedCount;
        case 'tv_episodes_count':  return tvEpisodesCount;
        case 'tv_completed_count': return tvCompletedCount;
        case 'tv_seasons_count':   return tvSeasonsCount;
        case 'tv_genre_count':     return tvGenreCount;
        case 'review_count':       return reviewsCount;
        default: return 0;
      }
    }

    // 4. Reconcile downward: revoke earned levels whose criteria_value now
    // exceeds the live stat (e.g. bulk-mark-watched then un-check episodes).
    // Silent — no notification, no push, no feed entry. Only criteria_types
    // with a successfully-fetched stat this run are eligible; see the
    // availability flags above and reconciliation.ts for the guard.
    const stats: Record<string, StatSnapshot> = {
      watched_count: { value: watchedCount, available: watchedAvailable },
      first_take_count: { value: firstTakesCount, available: firstTakesAvailable },
      night_owl: { value: nightOwlCount, available: nightOwlAvailable },
      genre_count: { value: genreCount, available: genresAvailable },
      tv_watched_count: { value: tvWatchedCount, available: tvAvailable },
      tv_episodes_count: { value: tvEpisodesCount, available: tvAvailable },
      tv_completed_count: { value: tvCompletedCount, available: tvAvailable },
      tv_seasons_count: { value: tvSeasonsCount, available: tvAvailable },
      tv_genre_count: { value: tvGenreCount, available: tvAvailable },
      review_count: { value: reviewsCount, available: reviewsAvailable },
    };

    const revocations = computeRevocations(earnedRaw || [], achievements, levelsByAchievement, stats);
    const revoked: RevokedAchievementLevel[] = [];

    for (const revoke of revocations) {
      // Intentionally NOT touching user_popcorn Milestone Kernel rows here —
      // Popcorn is disabled app-wide (POPCORN_ENABLED=false); leaving stray
      // kernel rows behind is lower risk than coupling this delete to a
      // disabled feature's table.
      const { error: deleteError } = await supabaseAdmin
        .from('user_achievements')
        .delete()
        .eq('user_id', userId)
        .eq('achievement_id', revoke.achievement_id)
        .eq('level', revoke.level);

      if (deleteError) {
        console.error('[check-achievements] Failed to revoke achievement level:', deleteError.message);
        continue;
      }

      revoked.push(revoke);
    }

    // 5. Evaluate every unearned level for every achievement and award qualifying ones
    const newlyAwarded: AwardedAchievement[] = [];

    for (const achievement of achievements) {
      const maxEarned = earnedMaxLevel.get(achievement.id) ?? 0;
      const levels = levelsByAchievement.get(achievement.id) ?? [];
      const statValue = getStatValue(achievement.criteria_type);

      for (const lvl of levels) {
        if (lvl.level <= maxEarned) continue;         // already earned
        if (statValue < lvl.criteria_value) continue; // not yet qualified

        const { error: insertError } = await supabaseAdmin
          .from('user_achievements')
          .insert({
            user_id: userId,
            achievement_id: achievement.id,
            level: lvl.level,
          });

        if (!insertError) {
          // Insert a Milestone Kernel into user_popcorn (fire-and-forget)
          const milestoneKernelId = crypto.randomUUID();
          supabaseAdmin.from('user_popcorn').insert({
            id: milestoneKernelId,
            user_id: userId,
            action_type: 'milestone',
            reference_id: lvl.id,
            seed: hashString(milestoneKernelId),
            is_milestone: true,
            achievement_id: achievement.id,
          }).then(() => {}).catch((e: Error) => console.error('[check-achievements] milestone kernel insert failed:', e));

          const unlockedAt = new Date().toISOString();
          newlyAwarded.push({
            achievement,
            level: lvl.level,
            level_description: lvl.description,
            unlocked_at: unlockedAt,
          });

          // Create a notification — fire and forget, don't fail the response
          supabaseAdmin.from('notifications').insert({
            user_id: userId,
            actor_id: null,
            type: 'achievement_unlock',
            data: {
              achievement_id: achievement.id,
              achievement_name: achievement.name,
              achievement_icon: achievement.icon,
              level: lvl.level,
              level_description: lvl.description,
            },
            read: false,
          }).then(({ error: notifError }) => {
            if (notifError) console.error('[check-achievements] Failed to create notification:', notifError.message);
          });

          // Send push notification — fire and forget
          fetch(
            `${SUPABASE_URL}/functions/v1/send-push-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                user_ids: [userId],
                title: 'Achievement unlocked',
                body: `You unlocked ${achievement.name}`,
                data: { url: '/achievements' },
                feature: 'social',
                channel_id: 'social',
              }),
            }
          ).catch((err) => {
            console.error('[check-achievements] Failed to send push notification:', err);
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ newly_awarded: newlyAwarded, revoked }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[check-achievements] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
