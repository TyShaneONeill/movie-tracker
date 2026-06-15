import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-123' },
  })),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn() },
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

import { useGenerateArt } from '@/hooks/use-generate-art';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

function mockTrialAndCredits(trialCount: number, adCredits = 0) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'ai_usage_costs') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: trialCount, error: null }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { rewarded_ad_credits: adCredits },
              error: null,
            }),
          }),
        }),
      };
    }
    return { select: jest.fn() };
  });
}

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

// ============================================================================
// Tests
// ============================================================================

describe('useGenerateArt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // hasUsedFreeTrial query
  // ==========================================================================

  describe('hasUsedFreeTrial', () => {
    it('returns false when user has no AI generations', async () => {
      mockTrialAndCredits(0);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await waitFor(() => {
        expect(result.current.hasUsedFreeTrial).toBe(false);
      });
    });

    it('returns true when user has a previous AI generation', async () => {
      mockTrialAndCredits(1);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await waitFor(() => {
        expect(result.current.hasUsedFreeTrial).toBe(true);
      });
    });
  });

  // ==========================================================================
  // ai_generation_limit error
  // ==========================================================================

  describe('ai_generation_limit error', () => {
    it('throws ai_generation_limit when edge function returns 403', async () => {
      mockTrialAndCredits(0);

      // Mock the edge function to return 403 with FunctionsHttpError shape
      // The actual SDK wraps the response in error.context (a Response-like object)
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: jest.fn().mockResolvedValue({
              error: 'ai_generation_limit',
              message: 'Free users get 1 AI art generation.',
              upgrade: true,
            }),
          },
        },
      });

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await act(async () => {
        try {
          await result.current.generateArt({
            journeyId: 'j1',
            movieTitle: 'Test',
            genres: ['Action'],
            posterUrl: 'https://image.tmdb.org/t/p/test.jpg',
          });
          // Should not reach here
          expect(true).toBe(false);
        } catch (e: any) {
          expect(e.message).toBe('ai_generation_limit');
        }
      });
    });
  });

  // ==========================================================================
  // onError handler
  // ==========================================================================

  describe('onError handler', () => {
    it('shows upgrade toast for ai_generation_limit error', async () => {
      const Toast = require('react-native-toast-message').default;

      mockTrialAndCredits(0);

      // Mock the edge function to return 403
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: jest.fn().mockResolvedValue({
              error: 'ai_generation_limit',
              message: 'Free users get 1 AI art generation.',
              upgrade: true,
            }),
          },
        },
      });

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await act(async () => {
        try {
          await result.current.generateArt({
            journeyId: 'j1',
            movieTitle: 'Test',
            genres: ['Action'],
            posterUrl: 'https://image.tmdb.org/t/p/test.jpg',
          });
        } catch {
          // expected — mutateAsync re-throws
        }
      });

      // onError should have shown the upgrade toast
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text1: 'Free trial used',
          text2: 'Upgrade to PocketStubs+ for unlimited AI art.',
        })
      );
    });

    it('shows generic error toast for non-limit errors', async () => {
      const Toast = require('react-native-toast-message').default;

      mockTrialAndCredits(0);

      // Mock a generic edge function error
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'Internal server error',
        },
      });

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await act(async () => {
        try {
          await result.current.generateArt({
            journeyId: 'j1',
            movieTitle: 'Test',
            genres: ['Action'],
            posterUrl: 'https://image.tmdb.org/t/p/test.jpg',
          });
        } catch {
          // expected
        }
      });

      // onError should have shown the generic error toast
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Generation failed',
        })
      );
    });

    it('re-syncs gating caches on a generic failure (prevents stale-cache limbo)', async () => {
      mockTrialAndCredits(1, 1);

      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Internal server error' },
      });

      const { queryClient, wrapper } = createTestHarness();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await act(async () => {
        try {
          await result.current.generateArt({
            journeyId: 'j1',
            movieTitle: 'Test',
            genres: ['Action'],
            posterUrl: 'https://image.tmdb.org/t/p/test.jpg',
          });
        } catch {
          // expected
        }
      });

      // The UI must re-fetch true gating state after ANY failure, so it can't
      // get stuck showing "Generate" while the server is out of generations.
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-trial-used'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ad-credits'] });
    });

    it('reports genuine failures to Sentry (for alerting), but not the expected out-of-generations case', async () => {
      const { captureException } = require('@/lib/sentry');

      // 1) Generic failure → captured.
      mockTrialAndCredits(1, 1);
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Internal server error' },
      });
      const h1 = createTestHarness();
      const { result: r1 } = renderHook(() => useGenerateArt(), { wrapper: h1.wrapper });
      await act(async () => {
        try {
          await r1.current.generateArt({ journeyId: 'j1', movieTitle: 'T', genres: [], posterUrl: 'https://image.tmdb.org/t/p/x.jpg' });
        } catch { /* expected */ }
      });
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'generate-journey-art' })
      );

      // 2) Expected out-of-generations (ai_generation_limit) → NOT captured.
      (captureException as jest.Mock).mockClear();
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'non-2xx',
          context: { json: jest.fn().mockResolvedValue({ error: 'ai_generation_limit' }) },
        },
      });
      const h2 = createTestHarness();
      const { result: r2 } = renderHook(() => useGenerateArt(), { wrapper: h2.wrapper });
      await act(async () => {
        try {
          await r2.current.generateArt({ journeyId: 'j2', movieTitle: 'T', genres: [], posterUrl: 'https://image.tmdb.org/t/p/x.jpg' });
        } catch { /* expected */ }
      });
      expect(captureException).not.toHaveBeenCalled();
    });
  });
});
