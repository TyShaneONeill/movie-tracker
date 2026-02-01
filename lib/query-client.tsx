import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { ReactNode } from 'react';

export const MUTATION_KEYS = {
  GENERATE_ART: 'generate-journey-art',
} as const;

interface GenerateArtResponse {
  success: boolean;
  imageUrl?: string;
  rarity?: 'common' | 'holographic';
  error?: string;
}

interface GenerateArtVariables {
  journeyId: string;
  movieTitle: string;
  genres: string[];
  posterUrl: string;
}

const mutationCache = new MutationCache({
  onSuccess: (data, variables, context, mutation) => {
    // Handle generate-art mutation success globally
    if (mutation.options.mutationKey?.[0] === MUTATION_KEYS.GENERATE_ART) {
      const artData = data as GenerateArtResponse;
      const isHolographic = artData.rarity === 'holographic';

      Toast.show({
        type: 'success',
        text1: isHolographic ? '🌟 Rare Holographic!' : '✨ Artwork Complete!',
        text2: isHolographic
          ? 'You got a rare holographic card!'
          : 'Your AI-generated artwork is ready to view.',
        visibilityTime: 4000,
      });
    }
  },
  onError: (error, variables, context, mutation) => {
    // Handle generate-art mutation error globally
    if (mutation.options.mutationKey?.[0] === MUTATION_KEYS.GENERATE_ART) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      Toast.show({
        type: 'error',
        text1: 'Generation Failed',
        text2: errorMessage,
        visibilityTime: 5000,
      });
    }
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false, // Better for mobile apps
    },
  },
  mutationCache,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export { queryClient };
