import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { MovieStatus } from '@/lib/database.types';

interface MovieStatusActionsProps {
  /** Current status of the movie (null if not in library) */
  currentStatus: MovieStatus | null;
  /** Whether a mutation is in progress */
  isLoading?: boolean;
  /** Called when user taps a status button */
  onStatusChange: (status: MovieStatus | null) => void;
}

interface StatusButtonProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  isLoading: boolean;
  onPress: () => void;
  activeColor: string;
}

function StatusButton({
  label,
  icon,
  activeIcon,
  isActive,
  isLoading,
  onPress,
  activeColor,
}: StatusButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      style={({ pressed }) => [
        styles.button,
        isActive && [styles.buttonActive, { borderColor: activeColor }],
        pressed && styles.buttonPressed,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isActive ? activeColor : Colors.dark.textSecondary} />
      ) : (
        <Ionicons
          name={isActive ? activeIcon : icon}
          size={20}
          color={isActive ? activeColor : Colors.dark.textSecondary}
        />
      )}
      <Text
        style={[
          styles.buttonLabel,
          isActive && { color: activeColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MovieStatusActions({
  currentStatus,
  isLoading = false,
  onStatusChange,
}: MovieStatusActionsProps) {
  const isWantToWatch = currentStatus === 'watchlist';
  const isWatching = currentStatus === 'watching';

  const handleWantToWatch = () => {
    if (isWantToWatch) {
      // Toggle off - remove from library
      onStatusChange(null);
    } else {
      // Add or switch to watchlist
      onStatusChange('watchlist');
    }
  };

  const handleWatching = () => {
    if (isWatching) {
      // Toggle off - remove from library
      onStatusChange(null);
    } else {
      // Add or switch to watching
      onStatusChange('watching');
    }
  };

  return (
    <View style={styles.container}>
      <StatusButton
        label="Want to Watch"
        icon="bookmark-outline"
        activeIcon="bookmark"
        isActive={isWantToWatch}
        isLoading={isLoading && isWantToWatch}
        onPress={handleWantToWatch}
        activeColor={Colors.dark.tint}
      />
      <StatusButton
        label="Watching"
        icon="play-circle-outline"
        activeIcon="play-circle"
        isActive={isWatching}
        isLoading={isLoading && isWatching}
        onPress={handleWatching}
        activeColor={Colors.dark.gold}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  buttonActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.1)', // tint with opacity
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
    fontWeight: '600',
  },
});
