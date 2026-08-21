/**
 * PS-15 v2 founder pass — a like does not extend the streak.
 *
 * It did in PR 3, and the founder's own device run is what unmade it: liking is
 * a passive tap, not participation, and a day of taps is not a day at the
 * movies. The regression this file guards is quiet — re-adding the call would
 * break no type and fail no other test, it would just start handing people
 * streaks they did not earn. Popcorn still earns on a like; that is a separate
 * currency and deliberately untouched.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/like-service', () => ({
  toggleLike: jest.fn(),
  fetchLikeStatus: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn() },
}));

const mockRecordActivity = jest.fn();
jest.mock('@/lib/streak-context', () => ({
  useStreak: () => ({ recordActivity: mockRecordActivity, streakVersion: 0 }),
}));

const mockEarn = jest.fn();
jest.mock('@/hooks/use-popcorn-earn', () => ({
  usePopcornEarn: () => ({ earn: mockEarn }),
}));

import { useReviewLike } from '@/hooks/use-review-like';
import { useAuth } from '@/hooks/use-auth';
import { toggleLike, fetchLikeStatus } from '@/lib/like-service';

const mockUseAuth = useAuth as jest.Mock;
const mockToggleLike = toggleLike as jest.Mock;
const mockFetchLikeStatus = fetchLikeStatus as jest.Mock;

const USER_ID = 'user-123';
const TARGET_ID = 'review-abc';

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

function renderLike() {
  const { wrapper } = createTestHarness();
  return renderHook(
    () =>
      useReviewLike({
        targetType: 'review',
        targetId: TARGET_ID,
        initialLiked: false,
        initialLikeCount: 0,
      }),
    { wrapper }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
  mockFetchLikeStatus.mockResolvedValue({ liked: false, likeCount: 0 });
});

describe('useReviewLike — streak trigger set', () => {
  it('does not record streak activity when a review is liked', async () => {
    mockToggleLike.mockResolvedValue({ liked: true, likeCount: 1 });

    const { result } = renderLike();
    await act(async () => {
      await result.current.toggleLike();
    });

    await waitFor(() => expect(result.current.liked).toBe(true));
    expect(mockRecordActivity).not.toHaveBeenCalled();
  });

  it('still earns popcorn on the like — the two currencies are separate', async () => {
    mockToggleLike.mockResolvedValue({ liked: true, likeCount: 1 });

    const { result } = renderLike();
    await act(async () => {
      await result.current.toggleLike();
    });

    expect(mockEarn).toHaveBeenCalledWith('like', TARGET_ID);
    expect(mockRecordActivity).not.toHaveBeenCalled();
  });

  it('records nothing on an unlike either', async () => {
    mockToggleLike.mockResolvedValue({ liked: false, likeCount: 0 });

    const { result } = renderLike();
    await act(async () => {
      await result.current.toggleLike();
    });

    expect(mockRecordActivity).not.toHaveBeenCalled();
    expect(mockEarn).not.toHaveBeenCalled();
  });
});
