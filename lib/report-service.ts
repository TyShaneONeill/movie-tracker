import { Platform } from 'react-native';
import { supabase } from './supabase';

export type ReportTargetType = 'user' | 'review' | 'comment' | 'first_take';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'hate_speech' | 'other';

// The reports table is not yet in generated database types,
// so we use a type-safe wrapper around the untyped query.

function reportsTable() {
  return supabase.from('reports' as any) as any;
}

/**
 * Report content (user, review, comment, or first take)
 */
export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  description?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await reportsTable()
    .insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      description: description || null,
    });

  if (error) {
    if (error.code === '23505') {
      throw new Error('ALREADY_REPORTED');
    }
    throw new Error(error.message || 'Failed to submit report');
  }

  const webhookUrl = process.env.EXPO_PUBLIC_DISCORD_MODERATION_WEBHOOK;
  if (webhookUrl) {
    if (Platform.OS === 'web') {
      const embed = {
        embeds: [{
          title: '🚨 New Report Submitted',
          color: 0xe11d48,
          fields: [
            { name: 'Type', value: targetType, inline: true },
            { name: 'Reason', value: reason, inline: true },
            { name: 'Target ID', value: targetId, inline: false },
            { name: 'Description', value: description || 'No additional details', inline: false },
          ],
          footer: { text: 'PocketStubs Moderation' },
          timestamp: new Date().toISOString(),
        }],
      };
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed),
      }).catch(() => {});
    } else {
      console.log('[Report] Discord webhook skipped on native (CORS). Report submitted:', { targetType, targetId, reason });
    }
  }
}

/**
 * Check if the current user has already reported this target
 */
export async function hasReported(
  targetType: ReportTargetType,
  targetId: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await reportsTable()
    .select('id')
    .eq('reporter_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check report status');
  }

  return !!data;
}
