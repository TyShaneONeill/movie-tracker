import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

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
    const [watchedResult, firstTakesResult, genresResult, nightOwlResult] = await Promise.all([
      supabaseAdmin
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'watched'),
      supabaseAdmin
        .from('first_takes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('quote_text', ''),
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
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
