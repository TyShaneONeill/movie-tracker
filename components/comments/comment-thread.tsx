import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useComments } from '@/hooks/use-comments';
import { CommentItem } from './comment-item';
import { CommentInput } from './comment-input';
import { useBlockedUsers } from '@/hooks/use-blocked-users';

interface CommentThreadProps {
  targetType: 'review' | 'first_take';
  targetId: string;
}

export function CommentThread({ targetType, targetId }: CommentThreadProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { blockedIds } = useBlockedUsers();

  const {
    comments: rawComments,
    totalCount,
    isLoading,
    addComment,
    isAdding,
    deleteComment: deleteCommentFn,
    reportComment: reportCommentFn,
    likeComment: likeCommentFn,
    currentUserId,
  } = useComments({ targetType, targetId });

  const comments = rawComments
    .filter((c) => !blockedIds.includes(c.commenter.userId ?? ''))
    .map((c) => ({
      ...c,
      replies: c.replies.filter((r) => !blockedIds.includes(r.commenter.userId ?? '')),
    }));

  const [replyTo, setReplyTo] = useState<{ commentId: string; username: string | null } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const toggleThread = useCallback((commentId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

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

  const handleLike = useCallback(
    async (commentId: string) => {
      try {
        await likeCommentFn(commentId);
      } catch {
        // Silently fail likes (optimistic update handles UI)
      }
    },
    [likeCommentFn]
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
        comments.map((comment) => {
          const isExpanded = expandedThreads.has(comment.id);
          const replyCount = comment.replies.length;

          return (
            <View key={comment.id}>
              <CommentItem
                comment={comment}
                currentUserId={currentUserId}
                onReply={handleReply}
                onDelete={handleDelete}
                onReport={handleReport}
                onLike={handleLike}
              />

              {/* Show replies if expanded */}
              {isExpanded && comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  isReply
                  onDelete={handleDelete}
                  onReport={handleReport}
                  onLike={handleLike}
                />
              ))}

              {/* Collapse/expand button */}
              {replyCount > 0 && (
                <Pressable
                  onPress={() => toggleThread(comment.id)}
                  style={styles.viewRepliesRow}
                >
                  <View style={styles.viewRepliesDash} />
                  <Text style={styles.viewRepliesText}>
                    {isExpanded
                      ? 'Hide replies'
                      : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
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
    viewRepliesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 40 + Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    viewRepliesDash: {
      width: 24,
      height: 1,
      backgroundColor: colors.textTertiary,
      marginRight: Spacing.sm,
    },
    viewRepliesText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}

export default CommentThread;
