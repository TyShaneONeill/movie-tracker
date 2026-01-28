import * as Linking from 'expo-linking';
import { supabase } from './supabase';

/**
 * Extract query params from a deep link URL.
 * Handles both `?code=xxx` (PKCE) and `#access_token=xxx` (implicit) flows.
 */
function extractParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  // Try query string first (?code=xxx)
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = url.substring(queryIndex + 1).split('#')[0];
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = decodeURIComponent(value);
      }
    }
  }

  // Also check hash fragment (#access_token=xxx)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hashString = url.substring(hashIndex + 1);
    for (const pair of hashString.split('&')) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = decodeURIComponent(value);
      }
    }
  }

  return params;
}

/**
 * Handle a deep link URL for Supabase auth.
 * Returns the path segment (e.g., 'reset-password') if auth was handled,
 * or null if the URL wasn't an auth-related deep link.
 */
export async function handleAuthDeepLink(url: string): Promise<string | null> {
  const parsed = Linking.parse(url);
  const params = extractParams(url);

  // PKCE flow: exchange code for session
  if (params.code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) {
        // TODO: Replace with Sentry error tracking
      }
    } catch {
      // TODO: Replace with Sentry error tracking
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
        // TODO: Replace with Sentry error tracking
      }
    } catch {
      // TODO: Replace with Sentry error tracking
    }
    return parsed.path || null;
  }

  return null;
}
