/**
 * IconButton Component
 *
 * Circular icon button with three variants:
 * - glass: Glassmorphism with blur backdrop
 * - card: Bordered card style
 * - primary: Rose gradient with shadow
 *
 * Based on ui-mocks/styles.css .btn-icon class (lines 193-207)
 */

import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Gradients } from '@/constants/theme';

type IconButtonVariant = 'glass' | 'card' | 'primary';

interface IconButtonProps {
  /** Icon render function receiving color as parameter */
  icon: (color: string) => React.ReactNode;
  /** Button variant - glass (blur), card (bordered), or primary (gradient) */
  variant?: IconButtonVariant;
  /** Size of the button in pixels (default: 40) */
  size?: number;
  /** Press handler */
  onPress: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional styles */
  style?: ViewStyle;
}

/**
 * IconButton component with glass, card, and primary variants
 *
 * @example
 * // Glass variant with blur backdrop
 * <IconButton
 *   icon={(color) => <BackIcon color={color} />}
 *   variant="glass"
 *   onPress={handleBack}
 * />
 *
 * @example
 * // Primary variant with gradient
 * <IconButton
 *   icon={(color) => <ShareIcon color={color} />}
 *   variant="primary"
 *   onPress={handleShare}
 * />
 */
export default function IconButton({
  icon,
  variant = 'card',
  size = 40,
  onPress,
  disabled = false,
  style,
}: IconButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const iconColor = variant === 'primary' ? '#ffffff' : colors.text;

  const baseButtonStyle = [
    styles.button,
    { width: size, height: size, borderRadius: size / 2 },
    style,
  ];

  // Render different variants
  if (variant === 'glass') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          baseButtonStyle,
          styles.glassContainer,
          { borderColor: colors.border },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <BlurView
          intensity={30}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        {icon(iconColor)}
      </Pressable>
    );
  }

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          baseButtonStyle,
          styles.primaryContainer,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <LinearGradient
          colors={Gradients.main as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {icon(iconColor)}
      </Pressable>
    );
  }

  // Default: card variant
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        baseButtonStyle,
        styles.cardContainer,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon(iconColor)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // Ensure blur/gradient don't overflow circular shape
  },
  glassContainer: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContainer: {
    borderWidth: 1,
  },
  primaryContainer: {
    overflow: 'hidden',
    // iOS shadow for primary button (matching styles.css box-shadow)
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    // Android elevation
    elevation: 8,
  },
  pressed: {
    transform: [{ scale: 0.92 }], // Matches styles.css .btn-icon:active
  },
  disabled: {
    opacity: 0.5,
  },
});
