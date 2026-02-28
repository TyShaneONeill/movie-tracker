import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from './cors.ts';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset_at: string;
}

/**
 * Check rate limit for a user action. Returns a 429 Response if exceeded, or null if allowed.
 *
 * Uses the generic `check_rate_limit` RPC which handles window tracking,
 * counter reset, and dev-tier bypass atomically in the database.
 *
 * @param userId - The authenticated user's ID
 * @param action - Unique action identifier (e.g. 'generate_journey_art')
 * @param maxRequests - Maximum requests allowed per window
 * @param windowSeconds - Window duration in seconds (e.g. 86400 for daily)
 * @param req - Original request (for CORS headers)
 */
export async function enforceRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
  req: Request,
): Promise<Response | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.rpc('check_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`Rate limit check failed for ${action}:`, error);
    // Fail open — don't block users due to infrastructure issues
    return null;
  }

  const result = data as RateLimitResult;

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        remaining: 0,
        limit: result.limit,
        reset_at: result.reset_at,
      }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          'Retry-After': String(
            Math.max(1, Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000))
          ),
        },
      },
    );
  }

  return null;
}

/**
 * Check IP-based rate limit for unauthenticated endpoints.
 * Returns a 429 Response if exceeded, or null if allowed.
 *
 * Uses the `check_ip_rate_limit` RPC which handles window tracking
 * and counter reset atomically in the database.
 *
 * @param ipAddress - The client's IP address
 * @param action - Unique action identifier (e.g. 'search_movies')
 * @param maxRequests - Maximum requests allowed per window
 * @param windowSeconds - Window duration in seconds (e.g. 3600 for hourly)
 * @param req - Original request (for CORS headers)
 */
export async function enforceIpRateLimit(
  ipAddress: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
  req: Request,
): Promise<Response | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.rpc('check_ip_rate_limit', {
    p_ip_address: ipAddress,
    p_action: action,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`IP rate limit check failed for ${action}:`, error);
    // Fail open — don't block requests due to infrastructure issues
    return null;
  }

  const result = data as RateLimitResult;

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        remaining: 0,
        limit: result.limit,
        reset_at: result.reset_at,
      }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          'Retry-After': String(
            Math.max(1, Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000))
          ),
        },
      },
    );
  }

  return null;
}
