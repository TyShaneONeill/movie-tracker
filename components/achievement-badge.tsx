import { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface AchievementBadgeProps {
  icon: string; // emoji
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string; // ISO date
  onPress?: () => void;
}

export function AchievementBadge({
  icon,
  name,
  unlocked,
  onPress,
}: AchievementBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, { opacity: (unlocked ? 1 : 0.4) * (pressed ? 0.7 : 1) }]}
      onPress={onPress}
    >
      <View
        style={[
          styles.badge,
          unlocked && { borderColor: colors.tint },
        ]}
      >
        <ThemedText style={styles.icon}>{icon}</ThemedText>
      </View>
      <ThemedText
        style={[styles.name, { color: unlocked ? colors.text : colors.textSecondary }]}
        numberOfLines={2}
      >
        {name}
      </ThemedText>
    </Pressable>
  );
}

const BADGE_SIZE = 48;

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      width: 64,
    },
    badge: {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      borderRadius: BADGE_SIZE / 2,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    icon: {
      fontSize: 22,
      lineHeight: 28,
    },
    name: {
      ...Typography.caption.medium,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
  });
