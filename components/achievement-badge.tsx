import { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface AchievementBadgeProps {
  icon: string;
  name: string;
  unlocked: boolean;
  currentLevel?: number;
  maxLevel?: number;
  imageUrl?: string | null;
  onPress?: () => void;
}

export function AchievementBadge({
  icon,
  name,
  unlocked,
  currentLevel,
  imageUrl,
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
      <View style={styles.badgeWrapper}>
        <View
          style={[
            styles.badge,
            unlocked && { borderColor: colors.tint },
          ]}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.badgeImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <ThemedText style={styles.icon}>{icon}</ThemedText>
          )}
        </View>
        {currentLevel != null && currentLevel > 0 && (
          <View style={[styles.levelBadge, { backgroundColor: colors.background }]}>
            <ThemedText style={[styles.levelText, { color: colors.gold }]}>
              {currentLevel}
            </ThemedText>
          </View>
        )}
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

const BADGE_SIZE = 56;

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      width: 72,
    },
    badgeWrapper: {
      position: 'relative',
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
      overflow: 'hidden',
    },
    badgeImage: {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
    },
    icon: {
      fontSize: 24,
      lineHeight: 30,
    },
    levelBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    levelText: {
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
    },
    name: {
      ...Typography.caption.medium,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
  });
