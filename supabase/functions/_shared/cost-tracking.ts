import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from './cors.ts';

/** Estimated cost per AI API call in USD */
export const AI_COST_ESTIMATES = {
  'gemini-2.0-flash': 0.005,
  'gpt-image-1.5': 0.08,
} as const;

/** Platform-wide daily spend limit in USD */
const DAILY_SPEND_LIMIT_USD = 10.0;

interface SpendCheckResult {
  allowed: boolean;
  total_today_usd: number;
  daily_limit_usd: number;
}

/**
 * Check if the platform-wide daily AI spend limit has been reached.
 * Fails open on errors (doesn't block users if tracking is down).
 */
export async function checkDailyAiSpend(
  supabaseAdmin: ReturnType<typeof createClient>,
  dailyLimit: number = DAILY_SPEND_LIMIT_USD,
): Promise<SpendCheckResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_daily_ai_spend', {
      p_daily_limit_usd: dailyLimit,
    });

    if (error) {
      console.error('[cost-tracking] Failed to check spend limit:', error);
      return { allowed: true, total_today_usd: 0, daily_limit_usd: dailyLimit };
    }

    return data as SpendCheckResult;
  } catch {
    console.error('[cost-tracking] Unexpected error checking spend limit');
    return { allowed: true, total_today_usd: 0, daily_limit_usd: dailyLimit };
  }
}

/**
 * Log an AI API call cost. Non-blocking — errors are logged but don't throw.
 */
export async function logAiCost(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  functionName: string,
  model: string,
  estimatedCostUsd: number,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('ai_usage_costs')
      .insert({
        user_id: userId,
        function_name: functionName,
        model,
        estimated_cost_usd: estimatedCostUsd,
      });

    if (error) {
      console.error('[cost-tracking] Failed to log AI cost:', error);
    }
  } catch {
    console.error('[cost-tracking] Unexpected error logging cost');
  }
}

/**
 * Build a 429 response for when the daily AI spend limit is reached.
 */
export function buildSpendLimitResponse(
  req: Request,
  spendResult: SpendCheckResult,
): Response {
  return new Response(
    JSON.stringify({
      error: 'Daily AI usage limit reached. Please try again tomorrow.',
      totalTodayUsd: spendResult.total_today_usd,
      dailyLimitUsd: spendResult.daily_limit_usd,
    }),
    {
      status: 429,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    },
  );
}
