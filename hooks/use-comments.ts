import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  fetchComments,
  addComment,
  reportComment,
  deleteComment,
  likeComment as likeCommentService,
  type CommentsResponse,
  type CommentLikeResponse,
} from '@/lib/comment-service';

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
    onSuccess: () => {
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

  const reportMutation = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason?: string }) =>
      reportComment(commentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: string) => likeCommentService(commentId),
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
    reportComment: reportMutation.mutateAsync,
    isReporting: reportMutation.isPending,
    likeComment: likeMutation.mutateAsync,
    isLiking: likeMutation.isPending,
    currentUserId: user?.id,
  };
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
