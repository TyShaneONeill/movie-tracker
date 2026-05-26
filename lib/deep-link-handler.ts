import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { captureException } from './sentry';

/** Allowed parameter keys for auth deep links */
const ALLOWED_PARAMS = new Set([
  'code',
  'access_token',
  'refresh_token',
  'type',
  'token_type',
  'expires_in',
  'expires_at',
]);

/** Max length for any single parameter value */
const MAX_PARAM_LENGTH = 4096;

/**
 * Safely decode a URI component, returning null on malformed input.
 */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Validate that a parameter value is safe to use.
 * Must be a non-empty string within length limits and contain only
 * URL-safe characters (alphanumeric, hyphens, underscores, dots, tildes).
 */
function isValidParamValue(value: string): boolean {
  return value.length > 0 && value.length <= MAX_PARAM_LENGTH;
}

/**
 * Extract and validate query params from a deep link URL.
 * Handles both `?code=xxx` (PKCE) and `#access_token=xxx` (implicit) flows.
 * Only whitelisted param keys are extracted; values are validated for length.
 */
function extractParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const parsePairs = (raw: string) => {
    for (const pair of raw.split('&')) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) continue;

      const key = pair.substring(0, eqIndex);
      const rawValue = pair.substring(eqIndex + 1);

      if (!key || !rawValue || !ALLOWED_PARAMS.has(key)) continue;

      const decoded = safeDecode(rawValue);
      if (decoded && isValidParamValue(decoded)) {
        params[key] = decoded;
      }
    }
  };

  // Try query string first (?code=xxx)
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = url.substring(queryIndex + 1).split('#')[0];
    parsePairs(queryString);
  }

  // Also check hash fragment (#access_token=xxx)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hashString = url.substring(hashIndex + 1);
    parsePairs(hashString);
  }

  return params;
}

/**
 * Handle a deep link URL for Supabase auth.
 * Returns the path segment (e.g., 'reset-password') if auth was handled,
 * or null if the URL wasn't an auth-related deep link.
 */
export async function handleAuthDeepLink(url: string): Promise<string | null> {
  try {
    const parsed = Linking.parse(url);
    const params = extractParams(url);

    // PKCE flow: exchange code for session
    if (params.code) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) {
          captureException(error instanceof Error ? error : new Error(String(error)), {
            context: 'deep-link-pkce',
          });
        }
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          context: 'deep-link-pkce',
        });
      }
      return parsed.path || null;
    }

    // Implicit flow: set session from tokens in hash
    if (params.access_token && params.refresh_token) {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error) {
          captureException(error instanceof Error ? error : new Error(String(error)), {
            context: 'deep-link-implicit',
          });
        }
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          context: 'deep-link-implicit',
        });
      }
      return parsed.path || null;
    }

    return null;
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: 'deep-link-handler',
      url,
    });
    return null;
  }
}

/**
 * Parse a deep-link or universal-link URL and extract a known content route.
 * Supports both the custom scheme (`pocketstubs://movie/123`) and the
 * universal-link form (`https://pocketstubs.com/movie/123`,
 * `https://www.pocketstubs.com/movie/123`).
 *
 * PRD-6 vertical slice: only `/movie/{id}` is wired up in this PR. The other
 * surfaces (`/tv`, `/review`, `/firsttake`) are routed in subsequent PRs —
 * see docs/PRD-social-share.md.
 *
 * Returns the matched content type + id, or null if the URL doesn't match a
 * supported content route.
 */
type ContentRoute =
  | { type: 'movie'; id: string }
  | { type: 'tv'; id: string }
  | { type: 'review'; id: string }
  | { type: 'firsttake'; id: string };

function parseContentUrl(url: string): ContentRoute | null {
  let pathname: string;

  try {
    // Custom scheme: pocketstubs://movie/123
    if (url.startsWith('pocketstubs://')) {
      pathname = '/' + url.slice('pocketstubs://'.length);
    } else {
      // Universal link: https://[www.]pocketstubs.com/movie/123
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host !== 'pocketstubs.com' && host !== 'www.pocketstubs.com') {
        return null;
      }
      pathname = parsed.pathname;
    }
  } catch {
    return null;
  }

  // Strip leading slash and any trailing query/hash
  const cleaned = pathname.replace(/^\/+/, '').split('?')[0].split('#')[0];
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const [type, rawId] = segments;
  // IDs come from TMDB (numeric) or Supabase (uuid). Restrict to safe charset.
  if (!/^[A-Za-z0-9_-]+$/.test(rawId)) return null;

  switch (type) {
    case 'movie':
      return { type: 'movie', id: rawId };
    case 'tv':
      return { type: 'tv', id: rawId };
    case 'review':
      return { type: 'review', id: rawId };
    case 'firsttake':
      return { type: 'firsttake', id: rawId };
    default:
      return null;
  }
}

/**
 * Handle a deep-link URL for content (movie / tv / review / first take).
 * Returns true if the URL was recognized and routed, false otherwise.
 *
 * Runs alongside `handleAuthDeepLink` — auth deep links and content deep
 * links live in disjoint URL spaces, so calling both is safe.
 */
export function handleContentDeepLink(url: string): boolean {
  try {
    const match = parseContentUrl(url);
    if (!match) return false;

    switch (match.type) {
      case 'movie':
        router.push(`/movie/${match.id}` as never);
        return true;
      // TODO(PRD-6): wire up tv / review / firsttake in subsequent PRs.
      case 'tv':
      case 'review':
      case 'firsttake':
        return false;
    }
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: 'content-deep-link-handler',
      url,
    });
    return false;
  }
}
