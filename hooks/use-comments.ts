import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  fetchComments,
  addComment,
  reportComment,
  deleteComment,
  updateComment as updateCommentService,
  likeComment as likeCommentService,
  type CommentsResponse,
  type UpdatedComment,
} from '@/lib/comment-service';
import { analytics } from '@/lib/analytics';
import { usePopcornEarn } from './use-popcorn-earn';
import { useStreak } from '@/lib/streak-context';

interface UseCommentsParams {
  targetType: 'review' | 'first_take';
  targetId: string;
  enabled?: boolean;
}

export function useComments({
  targetType,
  targetId,
  enabled = true,
}: UseCommentsParams) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { earn } = usePopcornEarn();
  const { recordActivity } = useStreak();

  const queryKey = ['comments', targetType, targetId];

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CommentsResponse>({
    queryKey,
    queryFn: () => fetchComments(targetType, targetId),
    enabled: enabled && !!targetId,
    staleTime: 60 * 1000, // 1 minute
  });

  const addMutation = useMutation({
    mutationFn: ({
      body,
      isSpoiler,
      parentCommentId,
    }: {
      body: string;
      isSpoiler?: boolean;
      parentCommentId?: string;
    }) => addComment(targetType, targetId, body, isSpoiler, parentCommentId),
    onSuccess: (newComment, variables) => {
      analytics.track('social:comment', {
        review_id: targetId,
        is_reply: !!variables.parentCommentId,
      });
      // PS-15 PR 3: commenting is a qualifying (non-earn) action.
      recordActivity('comment');
      earn('comment', newComment.id);
      queryClient.invalidateQueries({ queryKey });
      // Invalidate review queries to update comment counts
      queryClient.invalidateQueries({ queryKey: ['review', targetId] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews'] });
      queryClient.invalidateQueries({ queryKey: ['userReviews'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['review', targetId] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews'] });
      queryClient.invalidateQueries({ queryKey: ['userReviews'] });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateCommentService(commentId, body),
    // Optimistic update: reflect the new body + edited_at immediately.
    onMutate: async ({ commentId, body }: { commentId: string; body: string }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommentsResponse>(queryKey);
      const nowIso = new Date().toISOString();

      queryClient.setQueryData<CommentsResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: updateCommentBody(old.comments, commentId, body.trim(), nowIso),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (updated: UpdatedComment) => {
      // Reconcile with the server-returned row (canonical body + edited_at).
      queryClient.setQueryData<CommentsResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: updateCommentBody(
            old.comments,
            updated.id,
            updated.body,
            updated.editedAt,
          ),
        };
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason?: string }) =>
      reportComment(commentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: string) => {
      analytics.track('social:like', { target_type: 'comment', target_id: commentId });
      return likeCommentService(commentId);
    },
    // Optimistic update
    onMutate: async (commentId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommentsResponse>(queryKey);

      queryClient.setQueryData<CommentsResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: updateCommentLike(old.comments, commentId),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    comments: data?.comments ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    isError,
    error,
    refetch,
    addComment: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    deleteComment: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    editComment: editMutation.mutateAsync,
    isEditing: editMutation.isPending,
    reportComment: reportMutation.mutateAsync,
    isReporting: reportMutation.isPending,
    likeComment: likeMutation.mutateAsync,
    isLiking: likeMutation.isPending,
    currentUserId: user?.id,
  };
}

function updateCommentBody(
  comments: CommentsResponse['comments'],
  commentId: string,
  body: string,
  editedAt: string | null,
): CommentsResponse['comments'] {
  return comments.map((c) => {
    if (c.id === commentId) {
      return { ...c, body, editedAt };
    }
    return {
      ...c,
      replies: updateCommentBody(c.replies, commentId, body, editedAt),
    };
  });
}

function updateCommentLike(comments: CommentsResponse['comments'], commentId: string): CommentsResponse['comments'] {
  return comments.map(c => {
    if (c.id === commentId) {
      return {
        ...c,
        isLikedByMe: !c.isLikedByMe,
        likeCount: c.isLikedByMe ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
      };
    }
    return {
      ...c,
      replies: updateCommentLike(c.replies, commentId),
    };
  });
}
