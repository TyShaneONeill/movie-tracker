import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
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
}

export function AchievementBadge({
  icon,
  name,
  unlocked,
}: AchievementBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, { opacity: unlocked ? 1 : 0.4 }]}>
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
        numberOfLines={1}
      >
        {name}
      </ThemedText>
    </View>
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
