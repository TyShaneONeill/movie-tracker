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
