import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { fetchLikedBy } from '@/lib/like-service';

interface LikedByIndicatorProps {
  targetType: 'review' | 'first_take';
  targetId: string;
  likeCount: number;
}

export function LikedByIndicator({ targetType, targetId, likeCount }: LikedByIndicatorProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data } = useQuery({
    queryKey: ['likedBy', targetType, targetId],
    queryFn: () => fetchLikedBy(targetType, targetId, user?.id),
    enabled: likeCount > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.totalCount === 0 || data.likers.length === 0) {
    return null;
  }

  const { likers, totalCount } = data;
  const firstName = likers[0].fullName ?? likers[0].username ?? 'Someone';
  const othersCount = totalCount - 1;

  let text: string;
  if (totalCount === 1) {
    text = `Liked by ${firstName}`;
  } else if (othersCount === 1) {
    text = `Liked by ${firstName} and 1 other`;
  } else {
    text = `Liked by ${firstName} and ${othersCount} others`;
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.text} numberOfLines={1}>{text}</ThemedText>
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      marginTop: Spacing.xs,
    },
    text: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
  });
