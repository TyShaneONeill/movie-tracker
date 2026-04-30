/**
 * ToggleSwitch Component
 * iOS-style toggle switch with emerald active color
 * Used in settings and preference screens
 * Reference: ui-mocks/settings.html lines 48-76, styles.css .switcher, .switcher-knob
 */

import React from 'react';
import { Pressable, StyleSheet, Animated, ViewStyle } from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface ToggleSwitchProps {
  /**
   * Whether the switch is currently on
   * @default false
   */
  value: boolean;

  /**
   * Callback when the switch is toggled
   */
  onValueChange: (value: boolean) => void;

  /**
   * Whether the switch is disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * Custom color for the active state (overrides default emerald)
   * @default Colors.dark.accentSecondary (emerald)
   */
  activeColor?: string;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;

  /**
   * Accessibility label for screen readers and tests
   */
  accessibilityLabel?: string;
}

/**
 * ToggleSwitch component for on/off settings
 *
 * Features:
 * - iOS-style animated toggle
 * - Active state: emerald color (Emerald 500)
 * - Inactive state: secondary background
 * - Smooth transition animation (300ms)
 * - White circular knob with shadow
 * - Dimensions: 50x30px (matching HTML mock)
 *
 * @example
 * // Dark mode toggle in settings
 * <ToggleSwitch
 *   value={isDarkMode}
 *   onValueChange={setIsDarkMode}
 * />
 */
export function ToggleSwitch({
  value = false,
  onValueChange,
  disabled = false,
  activeColor,
  style,
  accessibilityLabel,
}: ToggleSwitchProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [animation] = React.useState(new Animated.Value(value ? 1 : 0));

  React.useEffect(() => {
    Animated.timing(animation, {
      toValue: value ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [value, animation]);

  const handlePress = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  const translateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20], // Matches HTML: 50px width - 26px knob - 4px padding = 20px travel
  });

  const backgroundColor = value ? (activeColor ?? colors.accentSecondary) : colors.backgroundSecondary;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={[
          styles.knob,
          {
            transform: [{ translateX }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 50,
    height: 30,
    borderRadius: BorderRadius.full, // 99px
    position: 'relative',
    justifyContent: 'center',
    padding: 2,
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4, // Android shadow
  },
});
