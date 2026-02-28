import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { hapticImpact } from '@/lib/haptics';
import Toast from 'react-native-toast-message';

import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import type { MovieStatus } from '@/lib/database.types';

interface MovieStatusActionsProps {
  /** Current status of the movie (null if not in library) */
  currentStatus: MovieStatus | null;
  /** Whether a mutation is in progress */
  isLoading?: boolean;
  /** Whether the buttons should be disabled (e.g. during pending mutations) */
  disabled?: boolean;
  /** Called when user taps a status button */
  onStatusChange: (status: MovieStatus | null) => void;
}

// SVG icon components
function BookmarkIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function EyeIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

function CheckIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

interface StatusButtonProps {
  label: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  isActive: boolean;
  isLoading: boolean;
  disabled: boolean;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
  borderColor: string;
}

function StatusButton({
  label,
  icon,
  activeIcon,
  isActive,
  isLoading,
  disabled,
  onPress,
  activeColor,
  inactiveColor,
  borderColor,
}: StatusButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading || disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${isActive ? 'selected' : 'not selected'}`}
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [
        styles.statusButtonContainer,
        pressed && styles.statusButtonPressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      <View
        style={[
          styles.statusCircle,
          { borderColor: isActive ? activeColor : borderColor },
          isActive && { backgroundColor: `${activeColor}15` },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isActive ? activeColor : inactiveColor} />
        ) : (
          isActive ? activeIcon : icon
        )}
      </View>
      <Text
        style={[
          styles.statusLabel,
          { color: isActive ? activeColor : inactiveColor },
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
  disabled = false,
  onStatusChange,
}: MovieStatusActionsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const isWatchlist = currentStatus === 'watchlist';
  const isWatching = currentStatus === 'watching';
  const isWatched = currentStatus === 'watched';

  const inactiveColor = colors.textSecondary;
  const borderColor = 'rgba(255, 255, 255, 0.1)';

  // Status colors
  const watchlistColor = colors.gold;
  const watchingColor = colors.blue;
  const watchedColor = colors.accentSecondary;

  const handleWatchlist = () => {
    hapticImpact();
    if (isWatchlist) {
      onStatusChange(null);
    } else {
      onStatusChange('watchlist');
      Toast.show({
        type: 'success',
        text1: 'Added to Watchlist',
        visibilityTime: 2000,
      });
    }
  };

  const handleWatching = () => {
    hapticImpact();
    if (isWatching) {
      onStatusChange(null);
    } else {
      onStatusChange('watching');
      Toast.show({
        type: 'success',
        text1: 'Now Watching',
        visibilityTime: 2000,
      });
    }
  };

  const handleWatched = () => {
    hapticImpact();
    if (isWatched) {
      onStatusChange(null);
    } else {
      onStatusChange('watched');
      Toast.show({
        type: 'success',
        text1: 'Marked as Watched',
        visibilityTime: 2000,
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusButton
        label="WATCHLIST"
        icon={<BookmarkIcon color={inactiveColor} />}
        activeIcon={<BookmarkIcon color={watchlistColor} />}
        isActive={isWatchlist}
        isLoading={isLoading && isWatchlist}
        disabled={disabled}
        onPress={handleWatchlist}
        activeColor={watchlistColor}
        inactiveColor={inactiveColor}
        borderColor={borderColor}
      />
      <StatusButton
        label="WATCHING"
        icon={<EyeIcon color={inactiveColor} />}
        activeIcon={<EyeIcon color={watchingColor} />}
        isActive={isWatching}
        isLoading={isLoading && isWatching}
        disabled={disabled}
        onPress={handleWatching}
        activeColor={watchingColor}
        inactiveColor={inactiveColor}
        borderColor={borderColor}
      />
      <StatusButton
        label="WATCHED"
        icon={<CheckIcon color={inactiveColor} />}
        activeIcon={<CheckIcon color={watchedColor} />}
        isActive={isWatched}
        isLoading={isLoading && isWatched}
        disabled={disabled}
        onPress={handleWatched}
        activeColor={watchedColor}
        inactiveColor={inactiveColor}
        borderColor={borderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginVertical: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusButtonContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  statusCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusLabel: {
    ...Typography.caption.default,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
});
