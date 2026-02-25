/**
 * FollowButton Component
 *
 * A button for following/unfollowing users with three visual states:
 * - Not following: Solid rose background, "Follow" text
 * - Following: Transparent with border, "Following" text with checkmark
 * - Unfollow intent (pressed while following): Red background, "Unfollow" text
 *
 * Features haptic feedback on iOS and a subtle scale animation on press.
 */

import React, { useState } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { hapticImpact } from '@/lib/haptics';

import { useTheme } from '@/lib/theme-context';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useFollow } from '@/hooks/use-follow';

interface FollowButtonProps {
  /** The user ID to follow/unfollow */
  userId: string;
  /** The username for toast notifications (without @ prefix) */
  username?: string | null;
  /** Button size variant */
  size?: 'sm' | 'md';
  /** Additional styles */
  style?: ViewStyle;
}

/**
 * FollowButton component for following/unfollowing users
 *
 * @example
 * // Basic usage
 * <FollowButton userId="user-123" />
 *
 * @example
 * // Small size with custom style
 * <FollowButton userId="user-123" size="sm" style={{ marginLeft: 8 }} />
 */
export function FollowButton({ userId, username, size = 'md', style }: FollowButtonProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const { isFollowing, isLoadingStatus, isTogglingFollow, toggleFollow } = useFollow(userId, { username });
  const isLoading = isLoadingStatus || isTogglingFollow;

  // Track if user is currently pressing the button (for unfollow intent state)
  const [isPressing, setIsPressing] = useState(false);

  const handlePress = async () => {
    hapticImpact();

    await toggleFollow();
  };

  // Determine button text based on state
  const getButtonText = (): string => {
    if (isFollowing) {
      return isPressing ? 'Unfollow' : 'Following';
    }
    return 'Follow';
  };

  // Determine if showing unfollow intent (pressing while following)
  const showUnfollowIntent = isFollowing && isPressing;

  // Size-based padding
  const paddingHorizontal = size === 'sm' ? Spacing.md : Spacing.lg;
  const paddingVertical = size === 'sm' ? Spacing.xs + 2 : Spacing.sm;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => setIsPressing(true)}
      onPressOut={() => setIsPressing(false)}
      disabled={isLoading}
      style={({ pressed }) => [
        styles.button,
        {
          paddingHorizontal,
          paddingVertical,
        },
        // Background color based on state
        !isFollowing && {
          backgroundColor: colors.tint,
        },
        isFollowing && !showUnfollowIntent && {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: effectiveTheme === 'dark' ? '#52525b' : colors.border, // zinc-600 for dark
        },
        showUnfollowIntent && {
          backgroundColor: '#dc2626', // red-600
          borderWidth: 0,
        },
        // Loading state
        isLoading && styles.loading,
        // Pressed effect
        pressed && styles.pressed,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={isFollowing && !showUnfollowIntent ? colors.text : '#ffffff'}
        />
      ) : (
        <Text
          style={[
            styles.text,
            size === 'sm' && styles.textSmall,
            // Text color based on state
            !isFollowing && {
              color: '#ffffff',
            },
            isFollowing && !showUnfollowIntent && {
              color: colors.text,
            },
            showUnfollowIntent && {
              color: '#ffffff',
            },
          ]}
        >
          {getButtonText()}
          {isFollowing && !isPressing && ' \u2713'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    minWidth: 90,
  },
  text: {
    ...Typography.button.primary,
    textAlign: 'center',
  },
  textSmall: {
    ...Typography.button.secondary,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
  loading: {
    opacity: 0.7,
  },
});

export default FollowButton;
