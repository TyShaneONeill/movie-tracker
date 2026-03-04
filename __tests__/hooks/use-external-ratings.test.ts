import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { makeRatingsResponse } from '../fixtures';
import { useExternalRatings } from '@/hooks/use-external-ratings';

// Mock the service
jest.mock('@/lib/ratings-service', () => ({
  fetchExternalRatings: jest.fn(),
}));

import { fetchExternalRatings } from '@/lib/ratings-service';

const mockFetchExternalRatings = fetchExternalRatings as jest.Mock;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('useExternalRatings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null ratings and source when no data yet', () => {
    mockFetchExternalRatings.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useExternalRatings(550), {
      wrapper: createWrapper(),
    });

    expect(result.current.ratings).toBeNull();
    expect(result.current.source).toBeNull();
  });

  it('returns ratings data when hook resolves', async () => {
    const response = makeRatingsResponse();
    mockFetchExternalRatings.mockResolvedValue(response);

    const { result } = renderHook(() => useExternalRatings(550), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ratings).toEqual(response.ratings);
    expect(result.current.source).toBe('omdb');
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetchExternalRatings).toHaveBeenCalledWith(550);
  });

  it('is disabled when tmdbId is undefined', () => {
    const { result } = renderHook(() => useExternalRatings(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.ratings).toBeNull();
    expect(result.current.source).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchExternalRatings).not.toHaveBeenCalled();
  });

  it('returns loading state initially', () => {
    mockFetchExternalRatings.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useExternalRatings(550), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);
  });

  it('returns error on fetch failure', async () => {
    mockFetchExternalRatings.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useExternalRatings(550), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.ratings).toBeNull();
    expect(result.current.source).toBeNull();
  });

  it('handles response with null ratings (unavailable)', async () => {
    const response = makeRatingsResponse({
      ratings: null,
      source: 'unavailable',
    });
    mockFetchExternalRatings.mockResolvedValue(response);

    const { result } = renderHook(() => useExternalRatings(550), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ratings).toBeNull();
    expect(result.current.source).toBe('unavailable');
  });
});
