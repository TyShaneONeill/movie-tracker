import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/release-calendar-service', () => ({
  getReleaseCalendar: jest.fn().mockResolvedValue({
    days: [],
    dates_with_releases: [],
    total_results: 0,
  }),
  getWatchlistTmdbIds: jest.fn().mockResolvedValue(new Set<number>()),
}));

import { useReleaseCalendar } from '@/hooks/use-release-calendar';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery');

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, prefetchSpy, queryClient };
}

describe('useReleaseCalendar — prefetch behavior', () => {
  it('prefetches month-1 and month+1 on mount', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 4, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 3, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 5, 'US'],
      })
    );
  });

  it('handles January boundary: prev = (Dec, year-1)', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 1, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2025, 12, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 2, 'US'],
      })
    );
  });

  it('handles December boundary: next = (Jan, year+1)', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 12, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 11, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2027, 1, 'US'],
      })
    );
  });

  it('prefetches new neighbors when month changes', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    const { rerender } = renderHook(
      (props: { month: number; year: number }) => useReleaseCalendar(props),
      {
        wrapper: Wrapper,
        initialProps: { month: 4, year: 2026 },
      }
    );

    prefetchSpy.mockClear();

    rerender({ month: 5, year: 2026 });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 4, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 6, 'US'],
      })
    );
  });

  it('does not prefetch when disabled', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(
      () => useReleaseCalendar({ month: 4, year: 2026, enabled: false }),
      { wrapper: Wrapper }
    );

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('honors custom region in prefetch keys', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(
      () => useReleaseCalendar({ month: 4, year: 2026, region: 'GB' }),
      { wrapper: Wrapper }
    );

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 3, 'GB'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 'v2-trailer', 2026, 5, 'GB'],
      })
    );
  });
});
