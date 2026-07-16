/**
 * Gate + data hooks for the TV Time blank-stubs rating deck (PR 4).
 *
 * Flag `tvtime_import_deck` is a SEPARATE kill switch from `tvtime_import` (the
 * import flow) — the deck can be disabled independently. The gate fails closed:
 * while PostHog is still resolving the flag the route shows nothing and never
 * bounces, and an unresolved/absent flag reads as OFF.
 */

import { useQuery } from '@tanstack/react-query';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { getSkipped } from '@/lib/tvtime-deck/skip-store';
import { fetchDeckData, type DeckData } from '@/lib/tvtime-deck/deck-service';

export const TVTIME_IMPORT_DECK_FLAG = 'tvtime_import_deck';

export interface TvTimeDeckGate {
  enabled: boolean;
  /** True while PostHog hasn't resolved the flag yet (fail closed, don't bounce). */
  resolving: boolean;
}

/**
 * Resolve the deck's feature flag with an env override for dev
 * (EXPO_PUBLIC_TVTIME_IMPORT_DECK_OVERRIDE = "true" | "false"), mirroring the
 * import gate and the other flag helpers.
 */
export function useTvTimeImportDeckGate(): TvTimeDeckGate {
  const { enabled, value } = useFeatureFlag(TVTIME_IMPORT_DECK_FLAG);
  const envOverride = process.env.EXPO_PUBLIC_TVTIME_IMPORT_DECK_OVERRIDE;

  if (envOverride === 'true') return { enabled: true, resolving: false };
  if (envOverride === 'false') return { enabled: false, resolving: false };

  return { enabled, resolving: value === undefined };
}

export interface UseTvTimeDeckResult {
  isLoading: boolean;
  isError: boolean;
  data: (DeckData & { skippedKeys: Set<string> }) | undefined;
  refetch: () => void;
}

/**
 * Load the deck's eligibility + progress + the user's persisted skip set. Used
 * both by the deck screen and by the "Ink your imported stubs" progress card
 * (which only needs `progress`).
 */
export function useTvTimeDeck(
  userId: string | undefined,
  enabled: boolean
): UseTvTimeDeckResult {
  const query = useQuery({
    queryKey: ['tvtimeDeck', userId],
    enabled: !!userId && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [deck, skippedKeys] = await Promise.all([
        fetchDeckData(userId!),
        getSkipped(userId!),
      ]);
      return { ...deck, skippedKeys };
    },
  });

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    data: query.data,
    refetch: query.refetch,
  };
}
