import { renderHook, waitFor, act } from '@testing-library/react-native';
import type { User } from '@supabase/supabase-js';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { useCalendarFilters, FILTER_CHIPS } from '@/hooks/use-calendar-filters';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as User;
}

/**
 * Builds a persist-side mock chain for update → eq → then.
 * Used as the fallback for all calls after the first (hydration) call.
 */
function makePersistChain() {
  const thenMock = jest.fn().mockResolvedValue({ error: null });
  const eqMock = jest.fn().mockReturnValue({ then: thenMock });
  const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
  return { updateMock, eqMock, thenMock };
}

/**
 * Sets up supabase.from to handle the hydration-then-persist call sequence.
 * Call 1 → hydration select chain
 * Calls 2+ → persist update chain (uses persistChain if provided, else a no-op chain)
 */
function setupHydrationMock(
  calendarDefaultFilters: unknown,
  persistChain?: ReturnType<typeof makePersistChain>
) {
  const pc = persistChain ?? makePersistChain();

  const hydrationSingleMock = jest.fn().mockResolvedValue({
    data: { calendar_default_filters: calendarDefaultFilters },
    error: null,
  });
  const hydrationEqMock = jest.fn().mockReturnValue({ single: hydrationSingleMock });
  const hydrationSelectMock = jest.fn().mockReturnValue({ eq: hydrationEqMock });

  let callCount = 0;
  mockFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return { select: hydrationSelectMock };
    }
    return { update: pc.updateMock };
  });

  return { hydrationSingleMock, persistChain: pc };
}

// ============================================================================
// Tests
// ============================================================================

describe('useCalendarFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Initializes with defaults
  it('initializes with all release types active and watchlistOnly false', () => {
    const { result } = renderHook(() => useCalendarFilters(null));

    expect(result.current.filterTypes).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(result.current.watchlistOnly).toBe(false);
  });

  // 2. Hydration from profile
  it('hydrates filter state from profile.calendar_default_filters', async () => {
    const user = makeUser();
    setupHydrationMock({ release_types: [1, 3], my_watchlist_only: true });

    const { result } = renderHook(() => useCalendarFilters(user));

    await waitFor(() => {
      expect(result.current.filterTypes).toEqual(new Set([1, 3]));
    });

    expect(result.current.watchlistOnly).toBe(true);
  });

  // 3. Guest mode skips supabase
  it('guest mode (user=null) does not call supabase', () => {
    renderHook(() => useCalendarFilters(null));

    expect(mockFrom).not.toHaveBeenCalled();
  });

  // 4. toggleFilterChip removes types when chip fully active
  it('toggleFilterChip removes types when chip is fully active', () => {
    const { result } = renderHook(() => useCalendarFilters(null));

    // Default state has all types active — theatrical [1,2,3] is fully active
    const theatrical = FILTER_CHIPS.find((c) => c.key === 'theatrical')!;

    act(() => {
      result.current.toggleFilterChip(theatrical);
    });

    expect(result.current.filterTypes.has(1)).toBe(false);
    expect(result.current.filterTypes.has(2)).toBe(false);
    expect(result.current.filterTypes.has(3)).toBe(false);
    // Other types should remain
    expect(result.current.filterTypes.has(4)).toBe(true);
    expect(result.current.filterTypes.has(6)).toBe(true);
  });

  // 5. toggleFilterChip adds types when chip is not fully active
  it('toggleFilterChip adds types when chip is not fully active', async () => {
    const user = makeUser();
    // Hydrate with only streaming + digital (4,5,6) — theatrical not present
    setupHydrationMock({ release_types: [4, 5, 6], my_watchlist_only: false });

    const { result } = renderHook(() => useCalendarFilters(user));

    await waitFor(() => {
      expect(result.current.filterTypes).toEqual(new Set([4, 5, 6]));
    });

    const theatrical = FILTER_CHIPS.find((c) => c.key === 'theatrical')!;

    act(() => {
      result.current.toggleFilterChip(theatrical);
    });

    // All 6 types should now be present
    expect(result.current.filterTypes).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  // 6. isChipActive true when all chip types in filterTypes
  it('isChipActive returns true when all chip types are in filterTypes', () => {
    const { result } = renderHook(() => useCalendarFilters(null));

    // Default state has all types — theatrical chip should be active
    const theatrical = FILTER_CHIPS.find((c) => c.key === 'theatrical')!;
    expect(result.current.isChipActive(theatrical)).toBe(true);
  });

  // 7. isChipActive false when one chip type is missing
  it('isChipActive returns false when one chip type is missing', async () => {
    const user = makeUser();
    // Hydrate with types 1,2 — theatrical needs 1,2,3 so it will be inactive
    setupHydrationMock({ release_types: [1, 2], my_watchlist_only: false });

    const { result } = renderHook(() => useCalendarFilters(user));

    await waitFor(() => {
      expect(result.current.filterTypes).toEqual(new Set([1, 2]));
    });

    const theatrical = FILTER_CHIPS.find((c) => c.key === 'theatrical')!;
    expect(result.current.isChipActive(theatrical)).toBe(false);
  });

  // 8. Auto-persist after hydration
  it('auto-persists filter changes to profile after hydration', async () => {
    const user = makeUser();
    const pc = makePersistChain();
    setupHydrationMock({ release_types: [1, 2, 3, 4, 5, 6], my_watchlist_only: false }, pc);

    const { result } = renderHook(() => useCalendarFilters(user));

    // Wait for hydration to complete
    await waitFor(() => {
      expect(result.current.filterTypes).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    });

    // Trigger a state change after hydration
    act(() => {
      result.current.setWatchlistOnly(true);
    });

    // Persist should be called with the new watchlistOnly value
    await waitFor(() => {
      expect(pc.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          calendar_default_filters: expect.objectContaining({
            my_watchlist_only: true,
          }),
        })
      );
    });
  });

  // 9. Does not persist before hydration completes
  // NOTE: The guard relies on filtersHydratedRef.current which is set inside
  // the hydration promise callback. If the hydration promise never resolves,
  // the ref stays false and the auto-persist effect's early-return guard fires.
  // We verify this by using a never-resolving hydration mock and confirming
  // the update path is not called even after a chip toggle.
  it('does not persist before hydration completes (guard check)', async () => {
    const user = makeUser();

    const persistUpdateMock = jest.fn();
    let firstCall = true;

    mockFrom.mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        // Hydration: never-resolving promise
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockReturnValue(new Promise(() => {})),
            }),
          }),
        };
      }
      // Persist path
      return {
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            then: persistUpdateMock,
          }),
        }),
      };
    });

    const { result } = renderHook(() => useCalendarFilters(user));

    // Toggle a chip immediately — hydration hasn't resolved
    act(() => {
      result.current.toggleFilterChip(FILTER_CHIPS[0]);
    });

    // Give microtasks a tick to settle
    await act(async () => {
      await Promise.resolve();
    });

    // The persist update should NOT have been called because hydration hasn't completed
    expect(persistUpdateMock).not.toHaveBeenCalled();
  });
});
