/**
 * useCalendarFilters
 * Manages filter state for the Release Calendar screen.
 *
 * Extracted from app/release-calendar.tsx to keep that screen under the
 * 500-line threshold called out in SP4-A's spec.
 *
 * Responsibilities:
 * - filterTypes (Set<number>) and watchlistOnly (boolean) state
 * - Hydration from profiles.calendar_default_filters on mount (auth-gated)
 * - Auto-persist to profiles.calendar_default_filters after hydration (auth-gated)
 * - toggleFilterChip and isChipActive helpers
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ============================================================================
// Filter chip configuration
// ============================================================================

/** Filter chip configuration */
export interface FilterChip {
  key: string;
  label: string;
  types: number[];
}

export const FILTER_CHIPS: FilterChip[] = [
  { key: 'theatrical', label: 'Theatrical', types: [1, 2, 3] },
  { key: 'streaming', label: 'Streaming', types: [6] },
  { key: 'digital_physical', label: 'Digital / Physical', types: [4, 5] },
];

// ============================================================================
// Hook return type
// ============================================================================

export interface UseCalendarFiltersResult {
  filterTypes: Set<number>;
  watchlistOnly: boolean;
  setWatchlistOnly: (val: boolean) => void;
  toggleFilterChip: (chip: FilterChip) => void;
  isChipActive: (chip: FilterChip) => boolean;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useCalendarFilters(user: User | null): UseCalendarFiltersResult {
  // Filter state: all release types enabled by default
  const [filterTypes, setFilterTypes] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  // Track whether hydration has completed so we don't persist
  // before we've loaded the saved state (avoids clobbering with defaults).
  const filtersHydratedRef = useRef(false);

  // Load saved filter preferences
  useEffect(() => {
    if (!user) {
      filtersHydratedRef.current = true; // guest mode — no hydration possible
      return;
    }
    supabase
      .from('profiles')
      .select('calendar_default_filters')
      .eq('id', user.id)
      .single()
      .then(({ data: profile, error }) => {
        if (error) {
          console.warn('[use-calendar-filters] hydrate filters failed', error);
          filtersHydratedRef.current = true;
          return;
        }
        if (profile?.calendar_default_filters) {
          const saved = profile.calendar_default_filters as {
            release_types?: number[];
            my_watchlist_only?: boolean;
          };
          if (saved.release_types) {
            setFilterTypes(new Set(saved.release_types));
          }
          if (typeof saved.my_watchlist_only === 'boolean') {
            setWatchlistOnly(saved.my_watchlist_only);
          }
        }
        filtersHydratedRef.current = true;
      });
  }, [user]);

  // Auto-persist filter changes after hydration completes.
  // Every filter change (Switch toggle, chip toggle) immediately writes to
  // the profile. Logs failures so silent RLS/auth errors don't hide bugs.
  useEffect(() => {
    if (!user) return;
    if (!filtersHydratedRef.current) return;
    supabase
      .from('profiles')
      .update({
        calendar_default_filters: {
          release_types: [...filterTypes],
          my_watchlist_only: watchlistOnly,
        },
      })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) {
          console.warn('[use-calendar-filters] persist filters failed', error);
        }
      });
  }, [user, filterTypes, watchlistOnly]);

  // Toggle a filter chip (add/remove its types from the active set)
  const toggleFilterChip = useCallback((chip: FilterChip) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      const allActive = chip.types.every((t) => next.has(t));
      if (allActive) {
        chip.types.forEach((t) => next.delete(t));
      } else {
        chip.types.forEach((t) => next.add(t));
      }
      return next;
    });
  }, []);

  // Check if a chip is active (all its types are in the active set)
  const isChipActive = useCallback(
    (chip: FilterChip) => chip.types.every((t) => filterTypes.has(t)),
    [filterTypes]
  );

  return {
    filterTypes,
    watchlistOnly,
    setWatchlistOnly,
    toggleFilterChip,
    isChipActive,
  };
}
