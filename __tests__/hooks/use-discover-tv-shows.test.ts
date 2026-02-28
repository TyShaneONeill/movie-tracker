import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { makeTMDBTvShow, makeSearchTvShowsResponse, createQueryWrapper } from './tv-show-test-helpers';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  discoverTvShowsByGenre: jest.fn(),
}));

import { useDiscoverTvShows } from '@/hooks/use-discover-tv-shows';
import { discoverTvShowsByGenre } from '@/lib/tv-show-service';

const mockDiscoverTvShowsByGenre = discoverTvShowsByGenre as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function renderDiscover(opts: Parameters<typeof useDiscoverTvShows>[0]) {
  return renderHook(() => useDiscoverTvShows(opts), {
    wrapper: createQueryWrapper(),
  });
}

async function renderDiscoverAndWait(opts: Parameters<typeof useDiscoverTvShows>[0]) {
  const hook = renderDiscover(opts);
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

// ============================================================================
// Tests
// ============================================================================

describe('useDiscoverTvShows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns shows filtered by genre', async () => {
    const response = makeSearchTvShowsResponse();
    mockDiscoverTvShowsByGenre.mockResolvedValue(response);

    const { result } = await renderDiscoverAndWait({ genreId: 18 });

    expect(result.current.shows).toEqual(response.shows);
    expect(mockDiscoverTvShowsByGenre).toHaveBeenCalledWith(18, 1);
  });

  it.each([
    { label: 'genreId is null', opts: { genreId: null as number | null } },
    { label: 'genreId is 0', opts: { genreId: 0 } },
    { label: 'enabled is false', opts: { genreId: 18, enabled: false } },
  ])('does not fetch when $label', ({ opts }) => {
    const { result } = renderDiscover(opts);

    expect(result.current.shows).toEqual([]);
    expect(mockDiscoverTvShowsByGenre).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'more pages available', page: 1, totalPages: 3, expected: true },
    { label: 'on last page', page: 3, totalPages: 3, expected: false },
  ])('hasNextPage is $expected when $label', async ({ page, totalPages, expected }) => {
    mockDiscoverTvShowsByGenre.mockResolvedValue(
      makeSearchTvShowsResponse({ page, totalPages })
    );

    const { result } = await renderDiscoverAndWait({ genreId: 18 });

    expect(result.current.hasNextPage).toBe(expected);
  });

  it('flattens shows from multiple pages via fetchNextPage', async () => {
    mockDiscoverTvShowsByGenre
      .mockResolvedValueOnce(
        makeSearchTvShowsResponse({
          shows: [makeTMDBTvShow({ id: 1, name: 'Show A' })],
          page: 1,
          totalPages: 2,
        })
      )
      .mockResolvedValueOnce(
        makeSearchTvShowsResponse({
          shows: [makeTMDBTvShow({ id: 2, name: 'Show B' })],
          page: 2,
          totalPages: 2,
        })
      );

    const { result } = await renderDiscoverAndWait({ genreId: 18 });

    expect(result.current.shows).toHaveLength(1);
    expect(result.current.shows[0].name).toBe('Show A');

    result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.shows).toHaveLength(2);
    });

    expect(result.current.shows[1].name).toBe('Show B');
  });

  it('returns error on service failure', async () => {
    mockDiscoverTvShowsByGenre.mockRejectedValue(
      new Error('Failed to discover TV shows')
    );

    const { result } = renderDiscover({ genreId: 18 });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to discover TV shows');
    expect(result.current.shows).toEqual([]);
  });
});
