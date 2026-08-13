/**
 * Onboarding v2 commit — orphaned-session guard.
 *
 * Regression cover for Sentry REACT-NATIVE-POCKETSTUBS-42
 * ("onboarding-v2: 3/3 watchlist inserts failed"). A session whose auth user
 * has been deleted keeps a valid access token, but profiles/user_movies rows
 * are cascade-gone, so the profile UPDATE matches zero rows and every
 * user_movies insert fails the user_id FK (23503 -> HTTP 409). The commit used
 * to read that as success and drop the person into an empty app.
 */
import { renderHook, act } from '@testing-library/react-native';
import React from 'react';

const mockProfileUpdate = jest.fn();
const mockProfileEq = jest.fn();
const mockProfileSelect = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockProfileUpdate(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockProfileEq(...eqArgs);
            return { select: mockProfileSelect };
          },
        };
      },
    })),
  },
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-onboarding', () => ({ useOnboarding: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/movie-service', () => ({ addMovieToLibrary: jest.fn() }));
jest.mock('@/lib/query-invalidation', () => ({ invalidateUserMovieQueries: jest.fn() }));
jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), setPersonProperties: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn().mockResolvedValue(undefined) })),
}));

import {
  OnboardingV2Provider,
  useOnboardingV2,
} from '@/components/onboarding/v2/onboarding-v2-context';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';
import { captureException } from '@/lib/sentry';
import { addMovieToLibrary } from '@/lib/movie-service';
import { analytics } from '@/lib/analytics';

const mockUseAuth = useAuth as jest.Mock;
const mockUseOnboarding = useOnboarding as jest.Mock;
const mockCapture = captureException as jest.Mock;
const mockAddMovie = addMovieToLibrary as jest.Mock;
const mockCompleteOnboarding = jest.fn();

const USER_ID = '2ee0425b-dec3-409a-a424-3c921db50471';

const MOVIE = {
  id: 550,
  title: 'Fight Club',
  overview: 'x',
  poster_path: '/p.jpg',
  backdrop_path: '/b.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
  genre_ids: [18],
} as never;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(OnboardingV2Provider, null, children);
}

function renderCommit() {
  const { result } = renderHook(() => useOnboardingV2(), { wrapper });
  act(() => {
    result.current.update({ genres: ['drama'], where: 'both', watchlist: [MOVIE] });
  });
  return result;
}

describe('onboarding v2 commit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
    mockCompleteOnboarding.mockResolvedValue(true);
    mockUseOnboarding.mockReturnValue({ completeOnboarding: mockCompleteOnboarding });
    mockAddMovie.mockResolvedValue({ id: 'row-1' });
    // Healthy account: the UPDATE matches exactly one profile row.
    mockProfileSelect.mockResolvedValue({ data: [{ id: USER_ID }], error: null });
  });

  it('commits and writes watchlist rows for a live account', async () => {
    const result = renderCommit();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(true);
    expect(mockAddMovie).toHaveBeenCalledWith(USER_ID, MOVIE, 'watchlist');
    expect(analytics.track).toHaveBeenCalledWith('onboarding:complete', expect.anything());
  });

  it('fails loudly when the profile UPDATE matches no row (orphaned session)', async () => {
    mockProfileSelect.mockResolvedValue({ data: [], error: null });
    const result = renderCommit();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('profile row missing') }),
      { context: 'onboarding-v2-orphaned-session' }
    );
  });

  it('skips the doomed watchlist inserts and never reports completion', async () => {
    mockProfileSelect.mockResolvedValue({ data: [], error: null });
    const result = renderCommit();

    await act(async () => {
      await result.current.commit();
    });

    // Each of these would have failed the user_id FK with a 409.
    expect(mockAddMovie).not.toHaveBeenCalled();
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('still returns false when the profile UPDATE itself errors', async () => {
    mockProfileSelect.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const result = renderCommit();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), {
      context: 'onboarding-v2-commit-profile',
    });
    expect(mockAddMovie).not.toHaveBeenCalled();
  });

  it('clears isSubmitting after an orphaned-session bail', async () => {
    mockProfileSelect.mockResolvedValue({ data: [], error: null });
    const result = renderCommit();

    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.isSubmitting).toBe(false);
  });
});
