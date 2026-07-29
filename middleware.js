/**
 * Vercel Routing Middleware — serve the marketing page AT `/` instead of redirecting to it.
 *
 * Why this exists
 * ---------------
 * `/` used to 307-redirect first-time visitors to `/welcome` (vercel.json `redirects`).
 * Googlebot never carries cookies, so it ALWAYS received that redirect. The result, confirmed
 * in Search Console on 2026-07-28:
 *
 *   - `https://pocketstubs.com/`        -> "Page is not indexed: Page with redirect"
 *   - `https://pocketstubs.com/welcome` -> "Duplicate, Google chose different canonical than user"
 *
 * i.e. the site had NO indexed homepage at all, while all 50 external backlinks
 * (44 from reddit.com, 6 from apple.com) pointed at that unindexed root.
 *
 * A `rewrites` entry in vercel.json cannot fix this: Vercel applies `rewrites` AFTER the
 * filesystem check, and `dist/index.html` already matches `/`, so the rewrite would never fire.
 * Routing Middleware runs before the cache and before filesystem routing, so it can.
 *
 * Behaviour is otherwise identical to the old redirect:
 *   - no `pocketstubs_visited` cookie -> marketing page, now served at `/` with HTTP 200
 *   - cookie present                  -> fall through to the app shell (dist/index.html)
 *   - OAuth callback params present   -> always fall through, never intercept
 *
 * The visible change for humans is that the URL stays `/` rather than becoming `/welcome`,
 * which is also what we want Google to index.
 */

import { next, rewrite } from '@vercel/functions';

const VISITED_COOKIE = 'pocketstubs_visited';

/**
 * Supabase returns to `/` carrying `code` (PKCE) or `access_token` (implicit) after auth.
 * Those requests must reach the app shell so the client can complete the session exchange —
 * serving marketing HTML there would silently break sign-in.
 */
const AUTH_CALLBACK_PARAMS = ['code', 'access_token'];

export default function middleware(request) {
  const url = new URL(request.url);

  for (const param of AUTH_CALLBACK_PARAMS) {
    if (url.searchParams.has(param)) return next();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const hasVisited = cookieHeader
    .split(';')
    .some((c) => c.trim().startsWith(`${VISITED_COOKIE}=`));

  if (hasVisited) return next();

  url.pathname = '/welcome';
  return rewrite(url);
}

export const config = {
  // Only `/` needs this. Every other path skips the middleware entirely.
  matcher: '/',
};
