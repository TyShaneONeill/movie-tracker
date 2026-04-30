/**
 * Auth helper for cron-fired Supabase edge functions.
 *
 * USE THIS HELPER for any function invoked by `pg_cron` via `pg_net.http_post`,
 * or by another edge function via internal `fetch` with a service_role bearer.
 *
 * # Why this exists — the broken pattern
 *
 * The "obvious" pattern (DO NOT USE):
 *
 *     // ❌ BROKEN — silently 401s on the pg_net path
 *     const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
 *     if (!authHeader.includes(serviceRoleKey)) {
 *       return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... });
 *     }
 *
 * fails when the function is invoked via `pg_net` because the Bearer token's
 * bytes don't match the env var byte-for-byte. The vault-stored secret can
 * differ by trailing whitespace, encoding, or because Supabase has rotated
 * the service_role key since the vault was populated. In April 2026 this
 * caused `check-push-receipts` to silently 401 on every 15-min cron tick for
 * an unknown duration, and would have caused `send-release-reminders` to
 * never deliver a single push if it had been used. Fix: PR #412.
 *
 * If you're tempted to write `authHeader.includes(serviceRoleKey)` in a new
 * cron-fired function, STOP. Use this helper instead.
 *
 * # The right pattern
 *
 * 1. Set `verify_jwt = true` in the function's `config.toml`. Supabase
 *    validates the JWT signature at the gateway before the function body runs,
 *    rejecting forged or expired tokens automatically.
 * 2. Inside the body, call `requireServiceRole(req)`. It decodes the JWT
 *    payload (Supabase has already verified the signature) and confirms
 *    `role === 'service_role'`. Returns null on success, a Response on
 *    failure that you should return immediately.
 *
 * # Usage
 *
 *     import { requireServiceRole } from '../_shared/cron-auth.ts';
 *
 *     Deno.serve(async (req) => {
 *       const authError = requireServiceRole(req);
 *       if (authError) return authError;
 *       // ...the caller is now guaranteed to be service_role-authenticated.
 *     });
 *
 * # Why role=service_role and not just verify_jwt=true
 *
 * `verify_jwt = true` alone allows ANY valid Supabase JWT (anon, authenticated,
 * service_role) through the gateway. We additionally require `role=service_role`
 * so a logged-in user with their authenticated JWT cannot manually invoke a
 * function meant only for cron-driven internal calls. Defense in depth.
 */

export function requireServiceRole(req: Request): Response | null {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  let payload: { role?: string };
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded + '=='.slice(0, (4 - padded.length % 4) % 4));
    payload = JSON.parse(decoded);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (payload.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}
