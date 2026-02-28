import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { makeTMDBTvShow, makeTvShowListResponse, createQueryWrapper } from './tv-show-test-helpers';
import type { TvShowListResponse } from '@/lib/tmdb.types';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  getTvShowList: jest.fn(),
}));

import { useHomeTvShowLists } from '@/hooks/use-home-tv-show-lists';
import { getTvShowList } from '@/lib/tv-show-service';

const mockGetTvShowList = getTvShowList as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

/** Sets up mockGetTvShowList to return different shows per list type. */
function mockListsByType(lists: {
  trending?: ReturnType<typeof makeTMDBTvShow>[];
  airing_today?: ReturnType<typeof makeTMDBTvShow>[];
}) {
  mockGetTvShowList.mockImplementation((type: string) => {
    const shows = lists[type as keyof typeof lists] ?? [];
    return Promise.resolve(makeTvShowListResponse({ shows }));
  });
}

function renderHomeLists() {
  return renderHook(() => useHomeTvShowLists(), {
    wrapper: createQueryWrapper(),
  });
}

async function renderHomeListsAndWait() {
  const hook = renderHomeLists();
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

// ============================================================================
// Tests
// ============================================================================

describe('useHomeTvShowLists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns trending and airing today shows', async () => {
    const trendingShow = makeTMDBTvShow({ id: 1, name: 'Trending Show' });
    const airingShow = makeTMDBTvShow({ id: 2, name: 'Airing Today Show' });
    mockListsByType({ trending: [trendingShow], airing_today: [airingShow] });

    const { result } = await renderHomeListsAndWait();

    expect(result.current.trendingShows).toEqual([trendingShow]);
    expect(result.current.airingTodayShows).toEqual([airingShow]);
  });

  it('deduplicates shows across sections with airing today priority', async () => {
    const sharedShow = makeTMDBTvShow({ id: 1, name: 'Shared Show' });
    const trendingOnly = makeTMDBTvShow({ id: 2, name: 'Trending Only' });
    mockListsByType({
      trending: [sharedShow, trendingOnly],
      airing_today: [sharedShow],
    });

    const { result } = await renderHomeListsAndWait();

    expect(result.current.airingTodayShows).toEqual([sharedShow]);
    expect(result.current.trendingShows).toEqual([trendingOnly]);
  });

  it('deduplicates within airing today itself', async () => {
    const show = makeTMDBTvShow({ id: 1 });
    mockListsByType({ trending: [], airing_today: [show, show] });

    const { result } = await renderHomeListsAndWait();

    expect(result.current.airingTodayShows).toHaveLength(1);
  });

  it('shows loading state while fetching', () => {
    mockGetTvShowList.mockReturnValue(new Promise(() => {}));

    const { result } = renderHomeLists();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });

  it('is loading when only one list has resolved', async () => {
    let resolveTrending: (v: TvShowListResponse) => void;
    const trendingPromise = new Promise<TvShowListResponse>((r) => {
      resolveTrending = r;
    });

    mockGetTvShowList.mockImplementation((type: string) => {
      if (type === 'trending') return trendingPromise;
      return Promise.resolve(makeTvShowListResponse({ shows: [] }));
    });

    const { result } = renderHomeLists();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    resolveTrending!(makeTvShowListResponse({ shows: [] }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('returns empty arrays when both lists return empty', async () => {
    mockListsByType({ trending: [], airing_today: [] });

    const { result } = await renderHomeListsAndWait();

    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });

  it('handles service errors gracefully', async () => {
    mockGetTvShowList.mockRejectedValue(new Error('Network error'));

    const { result } = await renderHomeListsAndWait();

    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });
});
