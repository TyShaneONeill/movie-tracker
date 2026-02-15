import { useEffect, useMemo, useCallback } from 'react';
import { View, Pressable, Modal, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface AchievementCelebrationProps {
  achievement: {
    icon: string;
    name: string;
    description: string;
  } | null;
  visible: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

export function AchievementCelebration({
  achievement,
  visible,
  onDismiss,
}: AchievementCelebrationProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible && achievement) {
      // Reset values
      scale.value = 0.5;
      opacity.value = 0;

      // Animate in
      scale.value = withSpring(1, {
        damping: 12,
        stiffness: 180,
        mass: 0.8,
      });
      opacity.value = withTiming(1, { duration: 250 });

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => {
        runOnJS(handleDismiss)();
      }, AUTO_DISMISS_MS);

      return () => clearTimeout(timer);
    }
  }, [visible, achievement, scale, opacity, handleDismiss]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!achievement) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Animated.View style={[styles.card, cardAnimatedStyle]}>
          <Pressable>
            <ThemedText style={[styles.title, { color: colors.gold }]}>
              Achievement Unlocked!
            </ThemedText>
            <View style={[styles.iconContainer, { borderColor: colors.tint }]}>
              <ThemedText style={styles.icon}>{achievement.icon}</ThemedText>
            </View>
            <ThemedText style={[styles.name, { color: colors.text }]}>
              {achievement.name}
            </ThemedText>
            <ThemedText style={[styles.description, { color: colors.textSecondary }]}>
              {achievement.description}
            </ThemedText>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const ICON_SIZE = 80;

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: 'center',
      width: '80%',
      maxWidth: 320,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      ...Typography.body.lg,
      textAlign: 'center',
      marginBottom: Spacing.md,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    iconContainer: {
      width: ICON_SIZE,
      height: ICON_SIZE,
      borderRadius: ICON_SIZE / 2,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 3,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
      alignSelf: 'center',
    },
    icon: {
      fontSize: 40,
      lineHeight: 48,
    },
    name: {
      ...Typography.display.h3,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    description: {
      ...Typography.body.sm,
      textAlign: 'center',
    },
  });
