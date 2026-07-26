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
  | 'weekly_recap'
  | 'streak_at_risk'
  | 'continue_watching_nudges';

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
 * `streak_at_risk` (PS-15 PR 3) is OFF by default (opt-in) per Ty's 2026-07-06
 * instruction — it's a loss-framed evening nudge, so users must turn it on.
 * Opt-in is ALSO enforced server-side: get_streak_at_risk_candidates requires
 * an explicit enabled=true row, so the send-push-notification absent-row =
 * enabled default never sends this to a user who hasn't toggled it on. The UI
 * default here (OFF) and delivery therefore agree.
 * `continue_watching_nudges` is ON by default (opt-out). The delivery payload
 * uses feature='continue_watching' (so the log/dedup key stays that), so the
 * opt-out is enforced server-side in get_continue_watching_nudge_candidates as
 * a NOT EXISTS (enabled=false) check on this preference key — UI, candidates,
 * and delivery agree.
 */
export const NOTIFICATION_FEATURE_DEFAULTS: Record<NotificationFeature, boolean> = {
  release_reminders: true,
  tv_episode_reminders: true,
  day2_bridge: true,
  weekly_recap: true,
  streak_at_risk: false,
  continue_watching_nudges: true,
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
