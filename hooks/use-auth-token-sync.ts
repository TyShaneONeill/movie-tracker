import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { writeAuthToken } from '@/lib/widget-bridge';

/**
 * Mirrors the Supabase auth session + config to an App Groups file so the iOS
 * widget extension can make authenticated Supabase calls from its AppIntents.
 *
 * We also bake Supabase URL + anon key into this file because
 * @bacons/apple-targets' infoPlist block doesn't reliably propagate env vars
 * into the widget target's Info.plist - so Bundle.main.object(forInfoDictionaryKey:)
 * returns nil in the widget. App Groups is already the wire protocol between
 * main app and widget; extending it for config avoids a second mechanism.
 *
 * The widget reads this file (see expo-plugins/widget-extension/src/PocketStubsWidget/
 * Auth/AuthTokenReader.swift). Writes happen on:
 * - initial mount (captures current session if already signed in)
 * - auth state changes: SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, USER_UPDATED
 *
 * On sign-out the token fields are explicitly nulled so the widget's next
 * refresh reads a signed-out state and widget-side Supabase calls bail silently.
 * Supabase URL + anon key are stable and always written.
 */
export function useAuthTokenSync(): void {
  useEffect(() => {
    const extra = Constants.expoConfig?.extra ?? {};
    const supabaseUrl = (extra.supabaseUrl as string | undefined) ?? '';
    const supabaseAnonKey = (extra.supabaseAnonKey as string | undefined) ?? '';

    const write = (accessToken: string | null, userId: string | null) => {
      void writeAuthToken({
        access_token: accessToken,
        user_id: userId,
        supabase_url: supabaseUrl,
        supabase_anon_key: supabaseAnonKey,
      });
    };

    // Capture current session on mount (in case auth state doesn't re-fire INITIAL_SESSION)
    void supabase.auth.getSession().then(({ data: { session } }) => {
      write(session?.access_token ?? null, session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      try {
        write(session?.access_token ?? null, session?.user?.id ?? null);
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'auth-token-sync',
          level: 'warning',
          message: 'onAuthStateChange handler failed',
          data: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
