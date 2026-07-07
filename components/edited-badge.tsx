/**
 * EditedBadge (PS-12)
 *
 * A small, muted "Edited {date}" chip shown next to a post's original
 * timestamp when the post has been content-edited. The original created-at date
 * is always kept visible elsewhere — this badge is additive, never a
 * replacement.
 *
 * Renders nothing when `editedAt` is null/undefined (i.e. never edited).
 *
 * When `createdAt` is provided the chip becomes tappable: tapping toggles an
 * inline tooltip that shows BOTH full timestamps ("Posted {full} · Edited
 * {full}"). This works on web too (no native Alert dependency).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { formatRelativeTime, formatFullTimestamp } from '@/lib/utils';

interface EditedBadgeProps {
  /** ISO timestamp of the last content edit, or null when never edited. */
  editedAt: string | null | undefined;
  /**
   * ISO created-at timestamp. When provided the badge is tappable and reveals
   * a "Posted … · Edited …" tooltip with both full timestamps.
   */
  createdAt?: string | null;
  /** Compact variant — smaller text, used inline in dense card rows. */
  compact?: boolean;
}

export function EditedBadge({ editedAt, createdAt, compact = false }: EditedBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  if (!editedAt) return null;

  const label = `Edited ${formatRelativeTime(editedAt)}`;
  const expandable = !!createdAt;

  const chip = (
    <View style={styles.chip}>
      <Ionicons
        name="pencil"
        size={compact ? 9 : 10}
        color={colors.textTertiary}
        style={styles.icon}
      />
      <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!expandable) {
    return chip;
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Show post and edit times"
      >
        {chip}
      </Pressable>
      {expanded && (
        <Text style={styles.tooltip}>
          Posted {formatFullTimestamp(createdAt)} · Edited {formatFullTimestamp(editedAt)}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    wrapper: {
      flexShrink: 1,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    icon: {
      marginTop: 0.5,
    },
    text: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    textCompact: {
      fontSize: 10,
    },
    tooltip: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      marginTop: Spacing.xs,
    },
  });
}

export default EditedBadge;
