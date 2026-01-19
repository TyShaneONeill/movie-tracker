/**
 * Mock notification data for frontend-first development
 * Based on ui-mocks/notifications.html
 */

export type NotificationType = 'follow' | 'review_like' | 'ticket' | 'list_follow' | 'comment' | 'system';

export interface MockNotification {
  id: string;
  type: NotificationType;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  movieId?: number;
  movieTitle?: string;
  moviePoster?: string;
  listId?: string;
  listTitle?: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  iconName?: string; // For system notifications
}

/**
 * Mock notifications matching ui-mocks/notifications.html structure
 * Includes 4 types: new follower, review like, system alert, list follow
 */
export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'notif_1',
    type: 'follow',
    userId: 'user_7',
    userName: 'Jordan Miller',
    userAvatar: 'https://i.pravatar.cc/150?u=jordan.miller',
    message: 'started following you',
    timestamp: '2m ago',
    read: false,
    actionLabel: 'Follow Back',
  },
  {
    id: 'notif_2',
    type: 'review_like',
    userId: 'user_8',
    userName: 'Taylor Swift',
    userAvatar: 'https://i.pravatar.cc/150?u=taylor.swift',
    movieId: 4,
    movieTitle: 'Avatar: The Way of Water',
    moviePoster: 'https://image.tmdb.org/t/p/w200/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    message: 'liked your review of Avatar: The Way of Water',
    timestamp: '1h ago',
    read: false,
  },
  {
    id: 'notif_3',
    type: 'ticket',
    movieId: 201,
    movieTitle: 'Zootopia 2',
    message: 'Your ticket for Zootopia 2 is ready to view',
    timestamp: '3h ago',
    read: false,
    iconName: 'ticket',
  },
  {
    id: 'notif_4',
    type: 'list_follow',
    userId: 'user_9',
    userName: 'Chris Anderson',
    userAvatar: 'https://i.pravatar.cc/150?u=chris.anderson',
    listId: '1',
    listTitle: 'Sci-Fi Masterpieces',
    message: 'followed your list Sci-Fi Masterpieces',
    timestamp: '1d ago',
    read: true,
  },
  {
    id: 'notif_5',
    type: 'comment',
    userId: 'user_10',
    userName: 'Sam Wilson',
    userAvatar: 'https://i.pravatar.cc/150?u=sam.wilson',
    movieId: 1,
    movieTitle: 'Dune: Part Two',
    message: 'commented on your review of Dune: Part Two',
    timestamp: '2d ago',
    read: true,
  },
  {
    id: 'notif_6',
    type: 'review_like',
    userId: 'user_11',
    userName: 'Morgan Lee',
    userAvatar: 'https://i.pravatar.cc/150?u=morgan.lee',
    movieId: 5,
    movieTitle: 'Oppenheimer',
    moviePoster: 'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    message: 'liked your review of Oppenheimer',
    timestamp: '3d ago',
    read: true,
  },
  {
    id: 'notif_7',
    type: 'system',
    message: 'New features available! Check out our updated analytics dashboard',
    timestamp: '1w ago',
    read: true,
    iconName: 'sparkles',
  },
];

/**
 * Helper to filter notifications by type
 */
export function filterNotificationsByType(
  notifications: MockNotification[],
  type?: NotificationType
): MockNotification[] {
  if (!type) {
    return notifications;
  }
  return notifications.filter((n) => n.type === type);
}

/**
 * Helper to get unread notification count
 */
export function getUnreadCount(notifications: MockNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

/**
 * Helper to mark all notifications as read
 */
export function markAllAsRead(notifications: MockNotification[]): MockNotification[] {
  return notifications.map((n) => ({ ...n, read: true }));
}

/**
 * Helper to mark a specific notification as read
 */
export function markAsRead(
  notifications: MockNotification[],
  notificationId: string
): MockNotification[] {
  return notifications.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
}
