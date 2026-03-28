/**
 * FollowButton Component
 *
 * A button for following/unfollowing users with four visual states:
 * - Not following: Solid rose background, "Follow" text
 * - Requested (pending): Outline style with clock icon, "Requested" text
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
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  const {
    requestStatus,
    isLoadingStatus,
    isTogglingFollow,
    isCancellingRequest,
    toggleFollow,
    cancelRequest,
  } = useFollow(userId, { username });

  const isLoading = isLoadingStatus || isTogglingFollow || isCancellingRequest;

  // Track if user is currently pressing the button (for unfollow intent state)
  const [isPressing, setIsPressing] = useState(false);

  const isFollowing = requestStatus === 'following';
  const isPending = requestStatus === 'pending';

  const handlePress = async () => {
    hapticImpact();

    // If there's a pending request, cancel it (with confirmation on native)
    if (isPending) {
      if (Platform.OS === 'web') {
        // Alert.alert is a no-op on web — cancel directly
        await cancelRequest();
      } else {
        Alert.alert(
          'Cancel Follow Request?',
          'Do you want to cancel your follow request?',
          [
            { text: 'Keep Request', style: 'cancel' },
            {
              text: 'Cancel Request',
              style: 'destructive',
              onPress: async () => {
                await cancelRequest();
              },
            },
          ]
        );
      }
      return;
    }

    await toggleFollow();
  };

  // Determine button text based on state
  const getButtonText = (): string => {
    if (isPending) {
      return 'Requested';
    }
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
        // "Follow" state: solid filled
        requestStatus === 'none' && {
          backgroundColor: colors.tint,
        },
        // "Requested" state: outline style
        isPending && {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: effectiveTheme === 'dark' ? '#52525b' : colors.border,
        },
        // "Following" state: outline style
        isFollowing && !showUnfollowIntent && {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: effectiveTheme === 'dark' ? '#52525b' : colors.border,
        },
        // "Unfollow" intent state: red
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
          color={
            (isFollowing || isPending) && !showUnfollowIntent
              ? colors.text
              : '#ffffff'
          }
        />
      ) : (
        <Text
          style={[
            styles.text,
            size === 'sm' && styles.textSmall,
            // Text color based on state
            requestStatus === 'none' && {
              color: '#ffffff',
            },
            isPending && {
              color: colors.text,
            },
            isFollowing && !showUnfollowIntent && {
              color: colors.text,
            },
            showUnfollowIntent && {
              color: '#ffffff',
            },
          ]}
        >
          {isPending && (
            <Ionicons
              name="time-outline"
              size={size === 'sm' ? 12 : 14}
              color={colors.text}
            />
          )}
          {isPending && ' '}
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
    flexDirection: 'row',
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
