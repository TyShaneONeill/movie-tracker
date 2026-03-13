/**
 * PremiumBadge Component
 * Small inline lock/crown indicator for premium features.
 * Shows a lock icon in the theme's gold color, optionally with "CineTrak+" text.
 */

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface PremiumBadgeProps {
  /** 'sm': icon only (12px). 'md': icon + "CineTrak+" text (14px). */
  size?: 'sm' | 'md';
  /** Optional style override for the container */
  style?: ViewStyle;
}

/**
 * Inline premium badge with lock icon.
 *
 * @example
 * <PremiumBadge size="sm" />
 * <PremiumBadge size="md" />
 */
export function PremiumBadge({ size = 'sm', style }: PremiumBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <View style={[styles.container, size === 'md' && styles.containerMd, style]}>
      <Ionicons name="lock-closed" size={iconSize} color={colors.gold} />
      {size === 'md' && (
        <Text style={[styles.label, { color: colors.gold }]}>CineTrak+</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerMd: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.body.xs,
    fontWeight: '600',
  },
});
