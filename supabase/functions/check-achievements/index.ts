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

interface AwardedAchievement {
  achievement: Achievement;
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

    // 1. Fetch all achievement definitions
    const { data: achievements, error: achError } = await supabaseAdmin
      .from('achievements')
      .select('*')
      .order('sort_order');

    if (achError) throw new Error(`Failed to fetch achievements: ${achError.message}`);

    // 2. Fetch user's already-earned achievements
    const { data: earnedRaw, error: earnedError } = await supabaseAdmin
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);

    if (earnedError) throw new Error(`Failed to fetch earned achievements: ${earnedError.message}`);

    const earnedIds = new Set((earnedRaw || []).map((e: { achievement_id: string }) => e.achievement_id));

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
        .select('status, episodes_watched, number_of_episodes, genre_ids')
        .eq('user_id', userId),
      supabaseAdmin
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const watchedCount = watchedResult.count ?? 0;
    const firstTakesCount = firstTakesResult.count ?? 0;

    // Count distinct genres
    const genreSet = new Set<number>();
    if (genresResult.data) {
      for (const movie of genresResult.data) {
        if (movie.genre_ids && Array.isArray(movie.genre_ids)) {
          for (const genreId of movie.genre_ids) {
            genreSet.add(genreId);
          }
        }
      }
    }
    const genreCount = genreSet.size;

    // TV stats
    const tvShows = tvResult.data ?? [];
    const tvWatchedCount = tvShows.filter(s => s.status === 'watched').length;
    const tvEpisodesCount = tvShows.reduce((sum, s) => sum + (s.episodes_watched ?? 0), 0);
    const tvCompletedCount = tvShows.filter(s =>
      s.episodes_watched != null &&
      s.number_of_episodes != null &&
      s.number_of_episodes > 0 &&
      s.episodes_watched >= s.number_of_episodes
    ).length;
    const tvGenreSet = new Set<number>();
    for (const show of tvShows) {
      if (show.genre_ids && Array.isArray(show.genre_ids)) {
        for (const id of show.genre_ids) tvGenreSet.add(id);
      }
    }
    const tvGenreCount = tvGenreSet.size;

    // Reviews count (for Critic achievement)
    const reviewsCount = reviewsResult.count ?? 0;

    // Check for night owl (midnight to 5 AM)
    let hasNightOwl = false;
    if (nightOwlResult.data) {
      for (const movie of nightOwlResult.data) {
        if (movie.watch_time) {
          const hour = parseInt(movie.watch_time.split(':')[0], 10);
          if (hour >= 0 && hour < 5) {
            hasNightOwl = true;
            break;
          }
        }
        if (movie.watched_at) {
          const date = new Date(movie.watched_at);
          const hour = date.getHours();
          if (hour >= 0 && hour < 5) {
            hasNightOwl = true;
            break;
          }
        }
      }
    }

    // 4. Evaluate each achievement and award new ones
    const newlyAwarded: AwardedAchievement[] = [];

    for (const achievement of (achievements || [])) {
      if (earnedIds.has(achievement.id)) continue;

      let earned = false;

      switch (achievement.criteria_type) {
        case 'first_take_count':
          earned = firstTakesCount >= achievement.criteria_value;
          break;
        case 'watched_count':
          earned = watchedCount >= achievement.criteria_value;
          break;
        case 'night_owl':
          earned = hasNightOwl;
          break;
        case 'genre_count':
          earned = genreCount >= achievement.criteria_value;
          break;
        case 'tv_watched_count':
          earned = tvWatchedCount >= achievement.criteria_value;
          break;
        case 'tv_episodes_count':
          earned = tvEpisodesCount >= achievement.criteria_value;
          break;
        case 'tv_completed_count':
          earned = tvCompletedCount >= achievement.criteria_value;
          break;
        case 'tv_genre_count':
          earned = tvGenreCount >= achievement.criteria_value;
          break;
        case 'review_count':
          earned = reviewsCount >= achievement.criteria_value;
          break;
      }

      if (earned) {
        const { error: insertError } = await supabaseAdmin
          .from('user_achievements')
          .insert({
            user_id: userId,
            achievement_id: achievement.id,
          });

        if (!insertError) {
          newlyAwarded.push({
            achievement,
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
