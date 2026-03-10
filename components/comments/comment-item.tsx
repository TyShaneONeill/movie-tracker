import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { formatRelativeTime } from '@/lib/utils';
import type { CommentItem as CommentItemType } from '@/lib/comment-service';

interface CommentItemProps {
  comment: CommentItemType;
  currentUserId?: string;
  isReply?: boolean;
  onReply?: (commentId: string, username: string | null) => void;
  onDelete?: (commentId: string) => void;
  onReport?: (commentId: string) => void;
}

export function CommentItem({
  comment,
  currentUserId,
  isReply = false,
  onReply,
  onDelete,
  onReport,
}: CommentItemProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  const isOwnComment = currentUserId === comment.commenter.userId;
  const displayName = comment.commenter.fullName || comment.commenter.username || 'Anonymous';
  const avatarUri = comment.commenter.avatarUrl
    ? buildAvatarUrl(comment.commenter.avatarUrl)
    : null;

  const handleLongPress = () => {
    if (comment.isHidden) return;

    const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' }[] = [];

    if (!isReply && onReply) {
      options.push({ text: 'Reply', onPress: () => onReply(comment.id, comment.commenter.username) });
    }

    if (isOwnComment && onDelete) {
      options.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Comment', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(comment.id) },
          ]);
        },
      });
    }

    if (!isOwnComment && onReport) {
      options.push({ text: 'Report', onPress: () => onReport(comment.id) });
    }

    if (options.length === 0) return;

    options.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });
    Alert.alert('Comment', undefined, options);
  };

  return (
    <Pressable onLongPress={handleLongPress} style={[styles.container, isReply && styles.reply]}>
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={[styles.avatar, isReply && styles.avatarSmall]}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.avatar, isReply && styles.avatarSmall, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={isReply ? 12 : 14} color={colors.textTertiary} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(comment.createdAt)}</Text>
        </View>

        {/* Body */}
        {comment.isHidden ? (
          <Text style={styles.hiddenText}>[This comment has been hidden]</Text>
        ) : comment.isSpoiler && !spoilerRevealed ? (
          <Pressable onPress={() => setSpoilerRevealed(true)}>
            <View style={styles.spoilerOverlay}>
              <Ionicons name="eye-off-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.spoilerText}>Spoiler — tap to reveal</Text>
            </View>
          </Pressable>
        ) : (
          <Text style={styles.body}>{comment.body}</Text>
        )}

        {/* Actions */}
        {!comment.isHidden && !isReply && onReply && (
          <Pressable
            onPress={() => onReply(comment.id, comment.commenter.username)}
            hitSlop={8}
            style={styles.replyButton}
          >
            <Text style={styles.replyButtonText}>Reply</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingVertical: Spacing.sm,
    },
    reply: {
      marginLeft: 40,
    },
    avatarContainer: {
      marginRight: Spacing.sm,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: BorderRadius.full,
    },
    avatarSmall: {
      width: 24,
      height: 24,
    },
    avatarPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: 2,
    },
    name: {
      ...Typography.body.sm,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    time: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    body: {
      ...Typography.body.sm,
      color: colors.text,
      lineHeight: 20,
    },
    hiddenText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      fontStyle: 'italic',
    },
    spoilerOverlay: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    spoilerText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    replyButton: {
      marginTop: 4,
      alignSelf: 'flex-start',
    },
    replyButtonText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}

export default CommentItem;
