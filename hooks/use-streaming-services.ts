import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  getStreamingProviders,
  getUserStreamingServices,
  addStreamingService,
  removeStreamingService,
} from '@/lib/streaming-service';
import type { StreamingProvider } from '@/lib/streaming-service';

/** Hook for the full list of available streaming providers */
export function useAvailableProviders(region: string = 'US') {
  return useQuery<StreamingProvider[]>({
    queryKey: ['streaming-providers', region],
    queryFn: () => getStreamingProviders(region),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - provider list rarely changes
  });
}

/** Hook for user's selected streaming services */
export function useUserStreamingServices() {
  const { user } = useAuth();

  return useQuery<StreamingProvider[]>({
    queryKey: ['user-streaming-services', user?.id],
    queryFn: () => getUserStreamingServices(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

/** Hook for toggling a streaming service on/off */
export function useToggleStreamingService() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ provider, isSelected }: { provider: StreamingProvider; isSelected: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      if (isSelected) {
        await removeStreamingService(user.id, provider.provider_id);
      } else {
        await addStreamingService(user.id, provider);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-streaming-services', user?.id] });
    },
  });
}
