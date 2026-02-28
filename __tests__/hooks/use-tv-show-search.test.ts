import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { makeSearchTvShowsResponse, createQueryWrapper } from './tv-show-test-helpers';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  searchTvShows: jest.fn(),
}));

import { useTvShowSearch } from '@/hooks/use-tv-show-search';
import { searchTvShows } from '@/lib/tv-show-service';

const mockSearchTvShows = searchTvShows as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function renderSearch(opts: Parameters<typeof useTvShowSearch>[0]) {
  return renderHook(() => useTvShowSearch(opts), {
    wrapper: createQueryWrapper(),
  });
}

async function renderSearchAndWait(opts: Parameters<typeof useTvShowSearch>[0]) {
  const hook = renderSearch(opts);
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

// ============================================================================
// Tests
// ============================================================================

describe('useTvShowSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns search results from service', async () => {
    const response = makeSearchTvShowsResponse();
    mockSearchTvShows.mockResolvedValue(response);

    const { result } = await renderSearchAndWait({ query: 'Breaking Bad' });

    expect(result.current.shows).toEqual(response.shows);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.totalResults).toBe(100);
    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 1);
  });

  it.each([
    { label: 'empty string', query: '' },
    { label: 'whitespace only', query: '   ' },
    { label: 'single character', query: 'a' },
    { label: 'enabled=false', query: 'Breaking Bad', enabled: false },
  ])('does not search when $label', ({ query, enabled }) => {
    const { result } = renderSearch({ query, enabled });

    expect(result.current.shows).toEqual([]);
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('trims query whitespace before searching', async () => {
    mockSearchTvShows.mockResolvedValue(makeSearchTvShowsResponse());

    await renderSearchAndWait({ query: '  Breaking Bad  ' });

    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 1);
  });

  it('passes page parameter to service', async () => {
    mockSearchTvShows.mockResolvedValue(
      makeSearchTvShowsResponse({ page: 3, totalPages: 5 })
    );

    const { result } = await renderSearchAndWait({
      query: 'Breaking Bad',
      page: 3,
    });

    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 3);
    expect(result.current.page).toBe(3);
  });

  it('returns error on service failure', async () => {
    mockSearchTvShows.mockRejectedValue(new Error('Network error'));

    const { result } = renderSearch({ query: 'Breaking Bad' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.shows).toEqual([]);
  });

  it('defaults pagination fields when query is disabled', () => {
    const { result } = renderSearch({ query: '' });

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.totalResults).toBe(0);
  });
});
