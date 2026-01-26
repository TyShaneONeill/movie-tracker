/**
 * Tag Component
 * Genre/filter chips with default and active states
 * Used for category filters and genre labels
 * Reference: ui-mocks/styles.css lines 280-288, search.html category-chip
 */

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface TagProps {
  /**
   * Text to display in the tag
   */
  label: string;

  /**
   * Whether the tag is in active/selected state
   * @default false
   */
  active?: boolean;

  /**
   * Callback when the tag is pressed
   * If not provided, tag will be non-interactive
   */
  onPress?: () => void;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;

  /**
   * Additional style overrides for the text
   */
  textStyle?: TextStyle;

  /**
   * Whether the tag is disabled
   * @default false
   */
  disabled?: boolean;
}

/**
 * Tag component for displaying genre labels, filter chips, and category selectors
 *
 * Features:
 * - Default state: secondary background with border
 * - Active state: primary accent background (Rose 600) with white text
 * - Optional press interaction
 * - Themed for light/dark mode
 *
 * @example
 * // Static genre label
 * <Tag label="Sci-Fi" />
 *
 * @example
 * // Interactive filter chip
 * <Tag
 *   label="Movies"
 *   active={selectedCategory === 'movies'}
 *   onPress={() => setSelectedCategory('movies')}
 * />
 */
export function Tag({
  label,
  active = false,
  onPress,
  style,
  textStyle,
  disabled = false,
}: TagProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Interactive tags use Pressable
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: active ? colors.tint : colors.backgroundSecondary,
            borderColor: active ? colors.tint : colors.border,
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          },
          style,
        ]}
      >
        <Text
          style={[
            styles.text,
            {
              color: active ? '#ffffff' : colors.textSecondary,
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  // Non-interactive tags use View
  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: active ? colors.tint : colors.backgroundSecondary,
          borderColor: active ? colors.tint : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      disabled
    >
      <Text
        style={[
          styles.text,
          {
            color: active ? '#ffffff' : colors.textSecondary,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start', // Shrink to content width
  },
  text: {
    ...Typography.tag.default,
  },
});
