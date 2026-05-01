/**
 * Notification preferences service — wraps the notification_preferences table.
 *
 * Semantics: returns `null` when no row exists (no preference set yet) so the
 * UI layer can apply its own default (e.g. OFF until explicitly enabled).
 * Toggling OFF persists enabled=false; toggling ON upserts enabled=true (so
 * the row exists and can be re-toggled cleanly).
 *
 * Note: the delivery side (`send-push-notification` edge function) currently
 * still treats absent rows as "enabled" — see PR-level out-of-scope notes for
 * the planned follow-up to reconcile UI default with delivery default.
 */

import { supabase } from './supabase';

export type NotificationFeature = 'release_reminders' | 'tv_episode_reminders';

export async function getNotificationPreference(
  feature: NotificationFeature
): Promise<boolean | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .maybeSingle();
  return data?.enabled ?? null;
}

export async function setNotificationPreference(
  feature: NotificationFeature,
  enabled: boolean
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        feature,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,feature' }
    );
  if (error) throw error;
}
