import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
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
      Alert.alert(
        'Report Submitted',
        "We'll review it shortly. Thank you for helping keep CineTrak safe."
      );
    },
    onError: (error: Error) => {
      if (error.message === 'ALREADY_REPORTED') {
        Alert.alert('Already Reported', "You've already reported this content.");
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    },
  });

  return {
    report: (params: ReportParams) => reportMutation.mutateAsync(params),
    isReporting: reportMutation.isPending,
  };
}
