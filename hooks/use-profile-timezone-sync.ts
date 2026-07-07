import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';

/**
 * Mounts once at the app root (PS-15 PR 0). On auth'd app start, compares the
 * device's IANA timezone (Intl.DateTimeFormat) against the stored
 * `profiles.timezone` and writes it when they differ. Debounced to once per
 * session via a ref — this is low-value background plumbing, not something
 * to repeat on every foreground transition.
 */
export function useProfileTimezoneSync(): void {
  const { user } = useAuth();
  // PS-15 PR 2 (#625 LOW): keyed by userId, not a plain boolean — a
  // same-device account switch (sign out, sign in as someone else) must
  // re-sync for the new user rather than staying permanently debounced
  // against the previous session.
  const syncedForUserIdRef = useRef<string | null>(null);

  const sync = useCallback(async (userId: string) => {
    let deviceTimezone: string | null = null;
    try {
      deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      deviceTimezone = null;
    }
    // Defensive: an exotic/unresolvable Intl result isn't worth persisting.
    if (!deviceTimezone) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data?.timezone === deviceTimezone) return;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ timezone: deviceTimezone })
        .eq('id', userId);
      if (updateError) throw updateError;
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        context: 'profile-timezone-sync',
      });
    }
  }, []);

  useEffect(() => {
    if (!user || syncedForUserIdRef.current === user.id) return;
    syncedForUserIdRef.current = user.id;
    void sync(user.id);
  }, [user, sync]);
}
