/**
 * Shared CORS configuration for Supabase Edge Functions.
 *
 * Restricts Access-Control-Allow-Origin to known origins instead of '*'.
 * React Native/Expo apps don't send Origin headers in the same way browsers do,
 * so this primarily protects against web-based cross-origin abuse.
 */

const ALLOWED_ORIGINS = [
  'https://pocketstubs.com',
  'https://www.pocketstubs.com',
  'http://localhost:8081', // Expo dev server
  'exp://192.168',         // Expo Go (prefix match)
];

/**
 * Build CORS headers based on the request's Origin.
 * If the origin matches an allowed value (exact or prefix), it is reflected back.
 * Otherwise the production domain is returned so the browser blocks the request.
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || origin.startsWith(allowed),
  );

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  };
}
