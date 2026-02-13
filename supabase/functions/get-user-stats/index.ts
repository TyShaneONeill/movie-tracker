import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Types
// ============================================================================

interface GenreCount {
  genre_id: number;
  count: number;
}

interface MonthlyCount {
  month: string;
  month_label: string;
  count: number;
}

interface UserStatsResponse {
  summary: {
    totalWatched: number;
    totalFirstTakes: number;
    averageRating: number | null;
  };
  genres: Array<{
    genreId: number;
    count: number;
    percentage: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    monthLabel: string;
    count: number;
  }>;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Get the authorization header to extract user ID
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Create user client to get user info
    const supabaseUserClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Create service client for queries
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Run all queries in parallel
    const [summaryResult, genresResult, monthlyResult] = await Promise.all([
      // Summary stats query
      supabaseClient.rpc('get_user_stats_summary', { p_user_id: user.id }),

      // Genre distribution query - using raw SQL since we need unnest
      supabaseClient.from('user_movies')
        .select('genre_ids')
        .eq('user_id', user.id)
        .eq('status', 'watched')
        .not('genre_ids', 'is', null),

      // Monthly activity query
      supabaseClient.rpc('get_user_monthly_activity', { p_user_id: user.id }),
    ]);

    // Process summary
    let summary = {
      totalWatched: 0,
      totalFirstTakes: 0,
      averageRating: null as number | null,
    };

    if (summaryResult.data && summaryResult.data.length > 0) {
      const row = summaryResult.data[0];
      summary = {
        totalWatched: row.total_watched || 0,
        totalFirstTakes: row.total_first_takes || 0,
        averageRating: row.avg_rating ? parseFloat(row.avg_rating.toFixed(1)) : null,
      };
    }

    // Process genres - aggregate from movies manually
    const genreCounts: Record<number, number> = {};
    let totalGenreCounts = 0;

    if (genresResult.data) {
      for (const movie of genresResult.data) {
        if (movie.genre_ids && Array.isArray(movie.genre_ids)) {
          for (const genreId of movie.genre_ids) {
            genreCounts[genreId] = (genreCounts[genreId] || 0) + 1;
            totalGenreCounts++;
          }
        }
      }
    }

    // Convert to sorted array and calculate percentages
    const genres = Object.entries(genreCounts)
      .map(([genreId, count]) => ({
        genreId: parseInt(genreId),
        count,
        percentage: totalGenreCounts > 0
          ? Math.round((count / totalGenreCounts) * 100)
          : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 genres

    // Process monthly activity
    const monthlyActivity: Array<{month: string; monthLabel: string; count: number}> = [];

    if (monthlyResult.data && Array.isArray(monthlyResult.data)) {
      for (const row of monthlyResult.data) {
        monthlyActivity.push({
          month: row.month,
          monthLabel: row.month_label,
          count: parseInt(row.count) || 0,
        });
      }
    }

    const response: UserStatsResponse = {
      summary,
      genres,
      monthlyActivity,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[get-user-stats] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
