import React, { useRef, useMemo, useCallback } from 'react';
import { Pressable, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReviewLike } from '@/hooks/use-review-like';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

const HEART_COLOR = '#EF4444';

interface LikeButtonProps {
  targetType: 'review' | 'first_take';
  targetId: string;
  initialLiked?: boolean;
  initialLikeCount?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
}

const ICON_SIZE = { sm: 16, md: 20 } as const;

export function LikeButton({
  targetType,
  targetId,
  initialLiked,
  initialLikeCount,
  size = 'sm',
  showCount = true,
}: LikeButtonProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { liked, likeCount, toggleLike, isToggling } = useReviewLike({
    targetType,
    targetId,
    initialLiked,
    initialLikeCount,
  });

  const handlePress = useCallback(() => {
    if (isToggling) return;
    hapticImpact();
    toggleLike();

    if (!liked) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isToggling, liked, toggleLike, scaleAnim]);

  const iconSize = ICON_SIZE[size];
  const countStyle = size === 'sm' ? Typography.body.xs : Typography.body.sm;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isToggling}
      hitSlop={8}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={iconSize}
          color={liked ? HEART_COLOR : colors.textSecondary}
        />
      </Animated.View>
      {showCount && likeCount > 0 && (
        <Text style={[countStyle, styles.count, { color: colors.textSecondary }]}>
          {likeCount}
        </Text>
      )}
    </Pressable>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    count: {
      minWidth: 12,
    },
  });
