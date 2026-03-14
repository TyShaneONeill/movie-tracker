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

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

import { useGenerateArt } from '@/hooks/use-generate-art';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

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
    it('returns false when user has no AI posters', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      });

      const { wrapper } = createTestHarness();
      const { result } = renderHook(() => useGenerateArt(), { wrapper });

      await waitFor(() => {
        expect(result.current.hasUsedFreeTrial).toBe(false);
      });
    });

    it('returns true when user has an AI poster', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }),
      });

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
      // Mock the trial query
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      });

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

      // Mock the trial query
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      });

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
          text2: 'Upgrade to CineTrak+ for unlimited AI art.',
        })
      );
    });

    it('shows generic error toast for non-limit errors', async () => {
      const Toast = require('react-native-toast-message').default;

      // Mock the trial query
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      });

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
  });
});
