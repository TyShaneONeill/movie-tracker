import { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import type { AchievementProgress } from '@/lib/achievement-service';

interface AchievementGridCardProps {
  progress: AchievementProgress;
  cardWidth: number;
  onPress: () => void;
}

export function AchievementGridCard({
  progress,
  cardWidth,
  onPress,
}: AchievementGridCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors, cardWidth), [colors, cardWidth]);

  const { achievement, levels, currentLevel, maxLevel } = progress;
  const earned = currentLevel > 0;

  const currentLevelData = levels.find(l => l.level === currentLevel);
  const imageUrl = currentLevelData?.image_url ?? null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { opacity: (earned ? 1 : 0.35) * (pressed ? 0.7 : 1) },
      ]}
      onPress={onPress}
    >
      <View style={styles.imageArea}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.emojiContainer}>
            <ThemedText style={styles.emoji}>{achievement.icon}</ThemedText>
          </View>
        )}
        {earned && currentLevelData && (
          <View style={styles.numberOverlay}>
            <ThemedText style={[styles.numberText, { color: colors.gold }]}>
              {currentLevelData.criteria_value}
            </ThemedText>
          </View>
        )}
      </View>
      <ThemedText
        style={[styles.name, { color: colors.text }]}
        numberOfLines={2}
      >
        {achievement.name}
      </ThemedText>
      <ThemedText style={[styles.progressText, { color: colors.textSecondary }]}>
        {currentLevel} of {maxLevel}
      </ThemedText>
    </Pressable>
  );
}

const createStyles = (colors: typeof Colors.dark, cardWidth: number) =>
  StyleSheet.create({
    container: {
      width: cardWidth,
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      paddingBottom: Spacing.sm,
    },
    imageArea: {
      width: cardWidth - 2,
      height: cardWidth - 2,
      borderTopLeftRadius: BorderRadius.md - 1,
      borderTopRightRadius: BorderRadius.md - 1,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    emojiContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.tint + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    emoji: {
      fontSize: 40,
      lineHeight: 48,
    },
    numberOverlay: {
      position: 'absolute',
      bottom: Spacing.xs,
      left: Spacing.sm,
    },
    numberText: {
      fontFamily: Typography.display.h2.fontFamily,
      fontSize: Typography.display.h2.fontSize,
      lineHeight: Typography.display.h2.lineHeight,
    },
    name: {
      ...Typography.caption.medium,
      textAlign: 'center',
      marginTop: Spacing.xs,
      paddingHorizontal: Spacing.xs,
    },
    progressText: {
      ...Typography.caption.default,
      textAlign: 'center',
      marginTop: 2,
    },
  });
