import { useMutation } from '@tanstack/react-query';
import {
  reportContent,
  type ReportTargetType,
  type ReportReason,
} from '@/lib/report-service';
import { analytics } from '@/lib/analytics';

interface ReportParams {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export function useReport() {
  const reportMutation = useMutation({
    mutationFn: async (params: ReportParams) => {
      await reportContent(
        params.targetType,
        params.targetId,
        params.reason,
        params.description
      );
      return params;
    },
    onSuccess: (params) => {
      analytics.track('moderation:report', {
        target_type: params.targetType,
        reason: params.reason,
      });
    },
    onError: () => {
      // Errors are handled inline by the ReportModal
    },
  });

  return {
    report: (params: ReportParams) => reportMutation.mutateAsync(params),
    isReporting: reportMutation.isPending,
  };
}
