import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { Avatar } from '@/components/ui/avatar';
import { formatRelativeTime } from '@/lib/utils';
import { EditedBadge } from '@/components/edited-badge';
import { COMMENT_MAX_LENGTH, validateCommentBody } from '@/lib/edited-provenance';
import { canEditComment, isEditWindowClosedError, EDIT_WINDOW_CLOSED_MESSAGE } from '@/lib/edit-window';
import { useSocialEditingEnabled } from '@/hooks/use-social-editing';
import type { CommentItem as CommentItemType } from '@/lib/comment-service';

interface CommentItemProps {
  comment: CommentItemType;
  currentUserId?: string;
  isReply?: boolean;
  onReply?: (commentId: string, username: string | null) => void;
  onDelete?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => Promise<void> | void;
  onReport?: (commentId: string) => void;
  onLike?: (commentId: string) => void;
  onUserPress?: (userId: string) => void;
}

export function CommentItem({
  comment,
  currentUserId,
  isReply = false,
  onReply,
  onDelete,
  onEdit,
  onReport,
  onLike,
  onUserPress,
}: CommentItemProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isOwnComment = currentUserId === comment.commenter.userId;
  // PS-12 (D1): the comment Edit action only appears when `social_editing` is ON.
  const socialEditingEnabled = useSocialEditingEnabled();
  // PS-12 edit grace window: content is editable only within 15 min of posting
  // AND before any engagement. Mirrors the DB trigger; keep in lockstep.
  const isEditable = canEditComment({
    created_at: comment.createdAt,
    like_count: comment.likeCount,
  });
  const displayName = comment.commenter.fullName || comment.commenter.username || 'Anonymous';

  const startEditing = () => {
    setEditText(comment.body);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditText(comment.body);
  };

  const saveEdit = async () => {
    if (!onEdit) return;
    const { valid, trimmed, error } = validateCommentBody(editText);
    if (!valid) {
      Alert.alert('Cannot save', error ?? 'Invalid comment');
      return;
    }
    // No-op if unchanged — just close the editor.
    if (trimmed === comment.body) {
      setIsEditing(false);
      return;
    }
    setIsSavingEdit(true);
    try {
      await onEdit(comment.id, trimmed);
      setIsEditing(false);
    } catch (err: any) {
      if (isEditWindowClosedError(err)) {
        setIsEditing(false);
        Alert.alert('Cannot edit', EDIT_WINDOW_CLOSED_MESSAGE);
      } else {
        Alert.alert('Error', err?.message || 'Failed to edit comment');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleUserPress = () => {
    if (comment.commenter.userId && onUserPress) {
      onUserPress(comment.commenter.userId);
    }
  };

  const handleLongPress = () => {
    if (comment.isHidden) return;

    const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' }[] = [];

    if (!isReply && onReply) {
      options.push({ text: 'Reply', onPress: () => onReply(comment.id, comment.commenter.username) });
    }

    if (isOwnComment && onEdit && isEditable && socialEditingEnabled) {
      options.push({ text: 'Edit', onPress: startEditing });
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
      {/* Avatar — taps through to the commenter's profile */}
      <Pressable onPress={handleUserPress} hitSlop={8} style={styles.avatarContainer}>
        <Avatar
          size={isReply ? 24 : 32}
          userId={comment.commenter.userId}
          avatarUrl={comment.commenter.avatarUrl}
          name={displayName}
        />
      </Pressable>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={handleUserPress} hitSlop={4} style={styles.namePressable}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
          </Pressable>
          <Text style={styles.time}>{formatRelativeTime(comment.createdAt)}</Text>
          {comment.editedAt && <EditedBadge editedAt={comment.editedAt} compact />}
          {comment.likedByAuthor && (
            <View style={styles.authorBadge}>
              <Ionicons name="heart" size={10} color="#EF4444" />
              <Text style={styles.authorBadgeText}>by author</Text>
            </View>
          )}
        </View>

        {/* Body */}
        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={COMMENT_MAX_LENGTH}
              editable={!isSavingEdit}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.editActions}>
              <Pressable onPress={cancelEditing} hitSlop={8} disabled={isSavingEdit}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveEdit} hitSlop={8} disabled={isSavingEdit}>
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <Text style={styles.editSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : comment.isHidden ? (
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

      {/* Like column on far right */}
      {!comment.isHidden && onLike && (
        <Pressable
          onPress={() => onLike(comment.id)}
          hitSlop={8}
          style={styles.likeColumn}
        >
          <Ionicons
            name={comment.isLikedByMe ? 'heart' : 'heart-outline'}
            size={isReply ? 14 : 16}
            color={comment.isLikedByMe ? '#EF4444' : colors.textTertiary}
          />
          {comment.likeCount > 0 && (
            <Text style={styles.likeCount}>{comment.likeCount}</Text>
          )}
        </Pressable>
      )}
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
    namePressable: {
      flexShrink: 1,
    },
    name: {
      ...Typography.body.sm,
      fontWeight: '600',
      color: colors.text,
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
    editContainer: {
      marginTop: 2,
    },
    editInput: {
      ...Typography.body.sm,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      minHeight: 40,
      textAlignVertical: 'top',
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: Spacing.md,
      marginTop: Spacing.xs,
    },
    editCancelText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    editSaveText: {
      ...Typography.body.xs,
      color: colors.tint,
      fontWeight: '700',
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
    authorBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    authorBadgeText: {
      ...Typography.body.xs,
      color: '#EF4444',
      fontSize: 10,
    },
    likeColumn: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 2,
      marginLeft: Spacing.sm,
      minWidth: 24,
    },
    likeCount: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      fontSize: 11,
      marginTop: 2,
    },
  });
}

export default CommentItem;
