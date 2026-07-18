import { supabase } from './supabase';
import type { Notification } from './database.types';

export interface PaginatedNotifications {
  notifications: Notification[];
  hasMore: boolean;
}

const PAGE_SIZE = 20;

// Fetch paginated notifications for a user
export async function getNotifications(
  userId: string,
  limit: number = PAGE_SIZE,
  offset: number = 0
): Promise<PaginatedNotifications> {
  // Request one extra to determine if there are more
  const { data, error } = await (supabase.from('notifications') as any)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) throw new Error(error.message || 'Failed to fetch notifications');

  const items = data ?? [];
  const hasMore = items.length > limit;

  return {
    notifications: hasMore ? items.slice(0, limit) : items,
    hasMore,
  };
}

// Get unread count
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await (supabase.from('notifications') as any)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) throw new Error(error.message || 'Failed to get unread count');
  return count ?? 0;
}

// Mark notification as read
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await (supabase.from('notifications') as any)
    .update({ read: true })
    .eq('id', notificationId);

  if (error) throw new Error(error.message || 'Failed to mark as read');
}

// Mark all as read
export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await (supabase.from('notifications') as any)
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) throw new Error(error.message || 'Failed to mark all as read');
}

// True if the notification's target content still exists — false for
// orphaned notifications whose comment/review/first-take was deleted
// (historical orphans predating the delete-cleanup triggers in
// 20260718090000/20260718090100, or a delete/tap race). Driven by which
// entity id is present in `data` rather than notification type, since
// friend_reviewed carries either review_id or first_take_id depending on
// which trigger wrote it (see #709).
export async function notificationTargetExists(
  notification: Pick<Notification, 'data'>
): Promise<boolean> {
  const data = (notification.data ?? {}) as Record<string, unknown>;

  if (typeof data.review_id === 'string') {
    const { data: review } = await (supabase.from('reviews') as any)
      .select('id')
      .eq('id', data.review_id)
      .maybeSingle();
    return !!review;
  }

  if (typeof data.first_take_id === 'string') {
    const { data: firstTake } = await (supabase.from('first_takes') as any)
      .select('id')
      .eq('id', data.first_take_id)
      .maybeSingle();
    return !!firstTake;
  }

  // Nothing content-specific to verify (follow, follow_request,
  // achievement_unlock, etc.) — always resolvable.
  return true;
}
