import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies before importing the hook
const mockGetReviewByTmdbId = jest.fn();
const mockCreateReview = jest.fn();
const mockUpdateReview = jest.fn();
const mockDeleteReview = jest.fn();

jest.mock('@/lib/review-service', () => ({
  getReviewByTmdbId: (...args: unknown[]) => mockGetReviewByTmdbId(...args),
  createReview: (...args: unknown[]) => mockCreateReview(...args),
  updateReview: (...args: unknown[]) => mockUpdateReview(...args),
  deleteReview: (...args: unknown[]) => mockDeleteReview(...args),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/achievement-context', () => ({
  useAchievementCheck: () => ({ triggerAchievementCheck: jest.fn() }),
}));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

import { useReviewActions } from '@/hooks/use-review-actions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useReviewActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReviewByTmdbId.mockResolvedValue(null);
  });

  it('returns hasReview false when no review exists', async () => {
    const { result } = renderHook(() => useReviewActions(550), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingReview).toBe(false);
    });

    expect(result.current.hasReview).toBe(false);
    expect(result.current.existingReview).toBeNull();
  });

  it('returns hasReview true when review exists', async () => {
    mockGetReviewByTmdbId.mockResolvedValue({
      id: 'rev-1',
      user_id: 'user-1',
      tmdb_id: 550,
      rating: 9,
    });

    const { result } = renderHook(() => useReviewActions(550), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingReview).toBe(false);
    });

    expect(result.current.hasReview).toBe(true);
    expect(result.current.existingReview?.id).toBe('rev-1');
  });

  it('provides mutation state flags', () => {
    const { result } = renderHook(() => useReviewActions(550), {
      wrapper: createWrapper(),
    });

    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });

  it('exposes create, update, delete functions', () => {
    const { result } = renderHook(() => useReviewActions(550), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.createReview).toBe('function');
    expect(typeof result.current.updateReview).toBe('function');
    expect(typeof result.current.deleteReview).toBe('function');
  });

  it('fires analytics review:create event after createReview success', async () => {
    mockCreateReview.mockResolvedValue({
      id: 'rev-2',
      user_id: 'user-1',
      tmdb_id: 550,
      rating: 8,
      review_text: 'Solid',
      is_rewatch: false,
      visibility: 'public',
      media_type: 'movie',
    });

    const { result } = renderHook(() => useReviewActions(550, 'movie'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingReview).toBe(false));

    await act(async () => {
      await result.current.createReview({
        tmdbId: 550,
        rating: 8,
        reviewText: 'Solid',
        isRewatch: false,
        visibility: 'public',
      } as Parameters<typeof result.current.createReview>[0]);
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'review:create',
      expect.objectContaining({
        media_type: 'movie',
        has_text: true,
        rating: 8,
        is_rewatch: false,
        visibility: 'public',
      }),
    );
  });
});
