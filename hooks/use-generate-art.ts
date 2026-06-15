import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { MUTATION_KEYS } from '@/lib/query-client';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';

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
  /** Server-assigned failure category (model_error, copyright, timeout, ...) */
  reason?: string;
}

/** Error carrying the server's failure `reason` so onError can tag analytics. */
type GenerationError = Error & { reason?: string };

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
    // Extract detailed error from FunctionsHttpError response
    const fnErrorAny = error as any;
    const httpStatus = fnErrorAny.status || fnErrorAny.context?.status;

    let errorBody: any = null;
    try {
      // Method 1: context.json() (FunctionsHttpError — context is a Response object)
      if (typeof fnErrorAny.context?.json === 'function') {
        errorBody = await fnErrorAny.context.json();
      }
      // Method 2: context.body as string (older SDK versions)
      else if (typeof fnErrorAny.context?.body === 'string') {
        errorBody = JSON.parse(fnErrorAny.context.body);
      }
      // Method 3: error.data
      else if (fnErrorAny.data) {
        errorBody = typeof fnErrorAny.data === 'string'
          ? JSON.parse(fnErrorAny.data)
          : fnErrorAny.data;
      }
    } catch {
      // Body parsing failed
    }

    console.error('[GenerateArt] Error:', {
      httpStatus,
      errorBody,
      message: error.message,
    });

    if (errorBody?.error === 'ai_generation_limit') {
      throw new Error('ai_generation_limit');
    }

    const e: GenerationError = new Error(
      errorBody?.error || error.message || 'Failed to generate art'
    );
    e.reason = errorBody?.reason;
    throw e;
  }

  if (!data?.success) {
    const e: GenerationError = new Error(data?.error || 'Failed to generate art');
    e.reason = data?.reason;
    throw e;
  }

  return data;
}

export function useGenerateArt() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if free trial has been used — matches the server's check in
  // generate-journey-art (ai_usage_costs, not user_movies.ai_poster_url)
  const { data: trialData } = useQuery({
    queryKey: ['ai-trial-used', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('ai_usage_costs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('function_name', 'generate_journey_art');
      return { used: (count ?? 0) > 0 };
    },
    enabled: !!user,
  });

  const hasUsedFreeTrial = trialData?.used ?? false;

  // Check available ad credits so UI can show "Generate" instead of "Watch Ad"
  const { data: adCreditsData } = useQuery({
    queryKey: ['ad-credits', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('rewarded_ad_credits')
        .eq('id', user!.id)
        .single();
      return data?.rewarded_ad_credits ?? 0;
    },
    enabled: !!user,
  });

  const adCredits = adCreditsData ?? 0;

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
    onMutate: (variables) => {
      analytics.track('generate:art:attempt', { journey_id: variables.journeyId });
      // Show "generating" toast immediately when mutation starts
      Toast.show({
        type: 'info',
        text1: '✨ Generating artwork...',
        text2: 'This takes ~30 seconds. Feel free to navigate away!',
        visibilityTime: 5000,
      });
    },
    onSuccess: (data, variables) => {
      analytics.track('generate:art:success', { journey_id: variables.journeyId, rarity: data.rarity });
      // Local invalidation for immediate UI update (in addition to global toast)
      queryClient.invalidateQueries({ queryKey: ['journey', variables.journeyId] });
      queryClient.invalidateQueries({ queryKey: ['journeysByMovie'] });
      invalidateUserMovieQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['ai-trial-used'] });
      queryClient.invalidateQueries({ queryKey: ['ad-credits'] });
    },
    onError: (error: Error, variables) => {
      // Tag the failure category so PostHog can break failures down by reason
      // (model_error, copyright, timeout, ...) — same taxonomy as the Discord alert.
      const reason =
        (error as GenerationError).reason ??
        (error.message === 'ai_generation_limit' ? 'out_of_generations' : 'client_error');
      analytics.track('generate:art:fail', { journey_id: variables.journeyId, error: error.message, reason });
      // Any failure can change server-side gating (the free trial flipping to
      // used, or a credit having been consumed). Re-sync so the UI never gets
      // stuck showing "Generate AI Art" while the server reports out-of-
      // generations — the disagreement that left users in limbo.
      queryClient.invalidateQueries({ queryKey: ['ai-trial-used'] });
      queryClient.invalidateQueries({ queryKey: ['ad-credits'] });
      if (error.message === 'ai_generation_limit') {
        queryClient.setQueryData(['ai-trial-used', user?.id], { used: true });
        queryClient.setQueryData(['ad-credits', user?.id], 0);
        Toast.show({
          type: 'info',
          text1: 'Free trial used',
          text2: 'Upgrade to PocketStubs+ for unlimited AI art.',
        });
        return;
      }
      // Genuine generation failure (not the expected out-of-generations case
      // above) — report to Sentry so failure spikes are visible and alertable.
      // The edge function only console.errors, so this is the feature's
      // server-error visibility.
      captureException(error, {
        context: 'generate-journey-art',
        journeyId: variables.journeyId,
      });
      // Generic error toast
      Toast.show({
        type: 'error',
        text1: 'Generation failed',
        text2: error.message || 'Something went wrong. Please try again.',
      });
    },
  });

  return {
    generateArt: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
    hasUsedFreeTrial,
    adCredits,
  };
}
