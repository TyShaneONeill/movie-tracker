/**
 * Section Header Component
 * Title + optional "See All" action link
 * Matches design from ui-mocks/home.html (lines 118-121, 157-159)
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export interface SectionHeaderProps {
  /** Section title text */
  title: string;
  /** Optional action link text (e.g., "See All") */
  actionText?: string;
  /** Callback when action link is pressed */
  onActionPress?: () => void;
  /** Optional custom styles for the container */
  style?: any;
}

export function SectionHeader({
  title,
  actionText,
  onActionPress,
  style,
}: SectionHeaderProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <View style={[styles.container, style]}>
      <Text
        style={[
          Typography.body.lg,
          { color: colors.text },
        ]}
      >
        {title}
      </Text>

      {actionText && onActionPress && (
        <Pressable
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.action,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text
            style={[
              Typography.body.smMedium,
              { color: colors.textSecondary },
            ]}
          >
            {actionText}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  action: {
    // Pressable area for better touch target
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
