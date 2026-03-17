import { Alert } from 'react-native';
import { useBlockedUsers } from '@/hooks/use-blocked-users';

interface BlockButtonProps {
  userId: string;
  username?: string | null;
}

/**
 * Headless block/unblock component.
 * Provides a trigger function rather than rendering UI —
 * the parent decides how to surface the action (menu item, button, etc.).
 */
export function useBlockAction(userId: string, username?: string | null) {
  const { isBlocked, blockUser, unblockUser, isBlocking, isUnblocking } = useBlockedUsers();
  const blocked = isBlocked(userId);
  const displayName = username ? `@${username}` : 'this user';

  const trigger = () => {
    if (blocked) {
      unblockUser(userId);
    } else {
      Alert.alert(
        'Block User',
        `Block ${displayName}? You won't see their content anymore.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => blockUser(userId),
          },
        ]
      );
    }
  };

  return {
    blocked,
    trigger,
    isPending: isBlocking || isUnblocking,
    label: blocked ? 'Unblock User' : 'Block User',
  };
}

export { BlockButtonProps };
