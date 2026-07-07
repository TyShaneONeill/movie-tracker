/**
 * Notification preferences service — wraps the notification_preferences table.
 *
 * Semantics: returns `null` when no row exists (no preference set yet). The
 * single source of truth for what an absent row MEANS is
 * `NOTIFICATION_FEATURE_DEFAULTS` below — callers resolve `null` through it
 * rather than assuming their own default. Toggling OFF persists enabled=false;
 * toggling ON upserts enabled=true (so the row exists and can be re-toggled
 * cleanly).
 *
 * PS-15 PR 0: the delivery side (`send-push-notification` edge function)
 * treats an absent row as "enabled" — these defaults make the UI tell the
 * same truth instead of rendering absent rows as OFF. See the mirroring
 * comment in that function.
 */

import { supabase } from './supabase';

export type NotificationFeature =
  | 'release_reminders'
  | 'tv_episode_reminders'
  | 'day2_bridge'
  | 'weekly_recap';

/**
 * Default enabled-state per feature when no `notification_preferences` row
 * exists for the user. Must match the `send-push-notification` edge
 * function's absent-row behavior — see the mirroring comment there.
 *
 * `day2_bridge` (PS-15 PR 1) is ON by default per Ty's 2026-07-06 decision —
 * OS permission still gates delivery either way.
 * `weekly_recap` (PS-15 PR 2) is ON by default for the same reason — it's a
 * positive-reinforcement digest, not a re-engagement nudge, and only sends
 * to users with qualifying activity that week.
 */
export const NOTIFICATION_FEATURE_DEFAULTS: Record<NotificationFeature, boolean> = {
  release_reminders: true,
  tv_episode_reminders: true,
  day2_bridge: true,
  weekly_recap: true,
};

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
