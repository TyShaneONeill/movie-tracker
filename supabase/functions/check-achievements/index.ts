import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

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
        .select('watched_at, watch_time')
        .eq('user_id', userId)
        .eq('status', 'watched')
        .not('watched_at', 'is', null),
      supabaseAdmin
        .from('user_tv_shows')
        .select('status, episodes_watched, number_of_episodes, number_of_seasons, genre_ids')
        .eq('user_id', userId),
      supabaseAdmin
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

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

    // Night owl: count of movies logged between midnight and 5 AM
    let nightOwlCount = 0;
    if (nightOwlResult.data) {
      for (const movie of nightOwlResult.data) {
        if (movie.watch_time) {
          const hour = parseInt(movie.watch_time.split(':')[0], 10);
          if (hour >= 0 && hour < 5) { nightOwlCount++; continue; }
        }
        if (movie.watched_at) {
          const hour = new Date(movie.watched_at).getHours();
          if (hour >= 0 && hour < 5) nightOwlCount++;
        }
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

    // 4. Evaluate every unearned level for every achievement and award qualifying ones
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
          newlyAwarded.push({
            achievement,
            level: lvl.level,
            level_description: lvl.description,
            unlocked_at: new Date().toISOString(),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ newly_awarded: newlyAwarded }),
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
