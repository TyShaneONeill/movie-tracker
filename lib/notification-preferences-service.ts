/**
 * Notification preferences service — wraps the notification_preferences table.
 *
 * Semantics: absence of a row means "enabled". This matches the existing
 * send-push-notification logic which only filters out users whose row says
 * enabled=false. Toggling OFF persists enabled=false; toggling ON upserts
 * enabled=true (so the row exists and can be re-toggled cleanly).
 */

import { supabase } from './supabase';

export type NotificationFeature = 'release_reminders';

export async function getNotificationPreference(
  feature: NotificationFeature
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return true;
  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .maybeSingle();
  return data?.enabled ?? true;
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
