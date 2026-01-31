import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

interface GenerateArtRequest {
  journeyId: string;
  movieTitle: string;
  genres: string[];
}

interface GenerateArtResponse {
  success: boolean;
  imageUrl?: string;
  rarity?: 'common' | 'holographic';
  error?: string;
}

async function generateJourneyArt(
  request: GenerateArtRequest,
  accessToken: string
): Promise<GenerateArtResponse> {
  const { data, error } = await supabase.functions.invoke<GenerateArtResponse>(
    'generate-journey-art',
    {
      body: request,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to generate art');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to generate art');
  }

  return data;
}

export function useGenerateArt() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const mutation = useMutation({
    mutationFn: async (request: GenerateArtRequest) => {
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      return generateJourneyArt(request, session.access_token);
    },
    onSuccess: (data, variables) => {
      // Invalidate journey queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['journey', variables.journeyId] });
      queryClient.invalidateQueries({ queryKey: ['journeysByMovie'] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  return {
    generateArt: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
