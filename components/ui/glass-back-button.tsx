// Theme-adaptive circular back button. Replaces expo-blur BlurView buttons on detail
// screens to avoid the iOS CABackdropLayer halo bug on circular views.

import React from 'react';
import { Pressable, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';

interface GlassBackButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Circular back button with a theme-adaptive semi-opaque background. */
export default function GlassBackButton({
  onPress,
  accessibilityLabel = 'Go back',
  style,
}: GlassBackButtonProps) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const backgroundColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)';
  const iconColor = isDark ? '#ffffff' : '#000000';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, style]}
    >
      <View style={[styles.inner, { backgroundColor, borderColor }]}>
        <Ionicons name="chevron-back" size={22} color={iconColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
});
