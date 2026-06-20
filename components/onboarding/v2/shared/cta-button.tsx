import { Pressable, StyleSheet, ActivityIndicator, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

interface CTAButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Full-width primary CTA: vertical rose→deep-rose gradient with a soft rose glow,
 * a neutral fill when disabled, and a subtle scale-down on press.
 */
export function CTAButton({ label, onPress, disabled, loading, icon = 'chevron-forward' }: CTAButtonProps) {
  const colors = Colors.dark;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.shadow,
        !isDisabled && styles.glow,
        { transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={isDisabled ? ['#3f3f46', '#3f3f46'] : [colors.tint, colors.accentHover]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.button, { opacity: isDisabled ? 0.55 : 1 }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.content}>
            <ThemedText style={styles.label}>{label}</ThemedText>
            <Ionicons name={icon} size={18} color="#fff" />
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: BorderRadius.md,
  },
  glow: Platform.select({
    ios: {
      shadowColor: Colors.dark.tint,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.45,
      shadowRadius: 14,
    },
    android: { elevation: 8 },
    default: {},
  }) as object,
  button: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
