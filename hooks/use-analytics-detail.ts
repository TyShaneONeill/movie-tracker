import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchAnalyticsDetail,
  type AnalyticsDetailType,
  type AnalyticsDetailFilter,
  type AnalyticsDetailItem,
} from '@/lib/analytics-detail-service';

export type { AnalyticsDetailType, AnalyticsDetailFilter, AnalyticsDetailItem };

export function useAnalyticsDetail(
  type: AnalyticsDetailType,
  filter?: AnalyticsDetailFilter,
  enabled = true
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['analyticsDetail', type, filter, user?.id],
    queryFn: () => fetchAnalyticsDetail(type, filter, user!.id),
    enabled: !!user && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
