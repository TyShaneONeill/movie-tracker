import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { supabase } from '@/lib/supabase';
import { MUTATION_KEYS } from '@/lib/query-client';

interface GenerateArtRequest {
  journeyId: string;
  movieTitle: string;
  genres: string[];
  posterUrl: string;
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
    // Extract detailed error info for debugging (similar to use-scan-ticket.ts)
    const fnErrorAny = error as any;
    const httpStatus = fnErrorAny.status || fnErrorAny.context?.status;
    let errorBody: any = null;
    try {
      if (fnErrorAny.context?.body) {
        errorBody = JSON.parse(fnErrorAny.context.body);
      }
    } catch {
      /* ignore parse errors */
    }

    console.error('[GenerateArt] Error:', {
      httpStatus,
      errorBody,
      message: error.message,
    });

    throw new Error(
      errorBody?.error || error.message || 'Failed to generate art'
    );
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to generate art');
  }

  return data;
}

export function useGenerateArt() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: [MUTATION_KEYS.GENERATE_ART],
    mutationFn: async (request: GenerateArtRequest) => {
      // Get session to extract access token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Not authenticated');
      }
      const accessToken = sessionData.session.access_token;
      return generateJourneyArt(request, accessToken);
    },
    onMutate: () => {
      // Show "generating" toast immediately when mutation starts
      Toast.show({
        type: 'info',
        text1: '✨ Generating artwork...',
        text2: 'This takes ~30 seconds. Feel free to navigate away!',
        visibilityTime: 5000,
      });
    },
    onSuccess: (data, variables) => {
      // Local invalidation for immediate UI update (in addition to global toast)
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
