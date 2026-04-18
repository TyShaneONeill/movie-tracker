import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { writeAuthToken } from '@/lib/widget-bridge';

/**
 * Mirrors the Supabase auth session to an App Groups file so the iOS widget
 * extension can make authenticated Supabase calls from its AppIntents.
 *
 * The widget reads this file (see expo-plugins/widget-extension/src/PocketStubsWidget/
 * Auth/AuthTokenReader.swift). Writes happen on:
 * - initial mount (captures current session if already signed in)
 * - auth state changes: SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, USER_UPDATED
 *
 * On sign-out the payload is explicitly nulled so the widget's next refresh
 * reads a signed-out state and widget-side Supabase calls bail silently.
 */
export function useAuthTokenSync(): void {
  useEffect(() => {
    const write = (accessToken: string | null, userId: string | null) => {
      void writeAuthToken({ access_token: accessToken, user_id: userId });
    };

    // Capture current session on mount (in case auth state doesn't re-fire INITIAL_SESSION)
    void supabase.auth.getSession().then(({ data: { session } }) => {
      write(session?.access_token ?? null, session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      write(session?.access_token ?? null, session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);
}
