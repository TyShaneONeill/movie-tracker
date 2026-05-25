import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchMyFeedback,
  submitFeatureRequest,
  type FeatureRequestRow,
  type SubmitFeedbackInput,
} from './feedback-service';
import { useAuth } from '@/hooks/use-auth';

const MY_FEEDBACK_KEY = ['my-feedback'] as const;

/**
 * Query the current user's recent feedback / feature-request submissions.
 * Gated on a signed-in user — guests get an empty list with no fetch.
 */
export function useMyFeedback() {
  const { user } = useAuth();
  return useQuery<FeatureRequestRow[]>({
    queryKey: MY_FEEDBACK_KEY,
    queryFn: () => fetchMyFeedback(20),
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation wrapping the submit_feature_request RPC. On success, invalidates
 * the user's submissions list so the new row appears.
 */
export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation<FeatureRequestRow, Error, SubmitFeedbackInput>({
    mutationFn: submitFeatureRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_FEEDBACK_KEY });
    },
  });
}
