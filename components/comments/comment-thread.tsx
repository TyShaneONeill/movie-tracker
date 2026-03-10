import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useComments } from '@/hooks/use-comments';
import { CommentItem } from './comment-item';
import { CommentInput } from './comment-input';

interface CommentThreadProps {
  targetType: 'review' | 'first_take';
  targetId: string;
}

export function CommentThread({ targetType, targetId }: CommentThreadProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    comments,
    totalCount,
    isLoading,
    addComment,
    isAdding,
    deleteComment: deleteCommentFn,
    reportComment: reportCommentFn,
    currentUserId,
  } = useComments({ targetType, targetId });

  const [replyTo, setReplyTo] = useState<{ commentId: string; username: string | null } | null>(null);

  const handleReply = useCallback((commentId: string, username: string | null) => {
    setReplyTo({ commentId, username });
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleSubmit = useCallback(
    async (body: string, isSpoiler: boolean) => {
      try {
        await addComment({
          body,
          isSpoiler,
          parentCommentId: replyTo?.commentId,
        });
        setReplyTo(null);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to add comment');
      }
    },
    [addComment, replyTo]
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        await deleteCommentFn(commentId);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to delete comment');
      }
    },
    [deleteCommentFn]
  );

  const handleReport = useCallback(
    async (commentId: string) => {
      Alert.alert('Report Comment', 'Are you sure you want to report this comment?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await reportCommentFn({ commentId });
              if (result.autoHidden) {
                Alert.alert('Thank you', 'This comment has been hidden due to multiple reports.');
              } else {
                Alert.alert('Thank you', 'Your report has been submitted.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to report comment');
            }
          },
        },
      ]);
    },
    [reportCommentFn]
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Comments</Text>
        <ActivityIndicator size="small" color={colors.tint} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        Comments{totalCount > 0 ? ` (${totalCount})` : ''}
      </Text>

      {comments.length === 0 ? (
        <Text style={styles.emptyText}>No comments yet. Be the first to comment!</Text>
      ) : (
        comments.map((comment) => (
          <View key={comment.id}>
            <CommentItem
              comment={comment}
              currentUserId={currentUserId}
              onReply={handleReply}
              onDelete={handleDelete}
              onReport={handleReport}
            />
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                isReply
                onDelete={handleDelete}
                onReport={handleReport}
              />
            ))}
          </View>
        ))
      )}

      {currentUserId && (
        <CommentInput
          onSubmit={handleSubmit}
          isSubmitting={isAdding}
          replyingTo={replyTo?.username}
          onCancelReply={handleCancelReply}
        />
      )}
    </View>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      marginTop: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.body.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    emptyText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.md,
    },
    loader: {
      marginVertical: Spacing.md,
    },
  });
}

export default CommentThread;
