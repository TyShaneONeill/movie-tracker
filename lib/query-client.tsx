import { QueryClient, MutationCache } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import type { ReactNode } from 'react';

/**
 * Bump this on any breaking change to `ReleaseCalendarResponse` shape
 * (e.g. SP4 adds a new release_type, fields renamed). Old persisted
 * cache deserializing into a stale shape could crash render.
 *
 * See lib/tmdb.types.ts → ReleaseCalendarResponse.
 */
export const RQ_PERSIST_BUSTER = '1';

/**
 * Persisted cache TTL. Anything older than this is dropped on hydration.
 * 7 days balances "instant cold launch" against "stale data we'd rather
 * skeleton-and-refetch" — release dates rarely shift more than a few days,
 * and the background refetch lands within ~300ms of hydration.
 */
export const RQ_PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * AsyncStorage key the persister uses. Versioned so a future-day rename
 * (e.g. cinetrak-rq-cache-v2) lets us drop all v1 data atomically.
 */
export const RQ_PERSIST_KEY = 'cinetrak-rq-cache-v1';

/**
 * Whitelist filter for the dehydrate pipeline. Only `release-calendar`
 * queries are written to AsyncStorage. Future expansion (e.g. SP4 might
 * persist `watchlist-tmdb-ids` for instant calendar dot rendering) is
 * a one-line OR change in this function.
 *
 * Why a whitelist, not blacklist: explicit opt-in prevents accidental
 * persistence of PII (auth tokens), volatile state (mutation results),
 * or paginated infinite queries.
 */
export function shouldDehydrateReleaseCalendar(query: Query): boolean {
  return query.queryKey[0] === 'release-calendar';
}

export const MUTATION_KEYS = {
  GENERATE_ART: 'generate-journey-art',
} as const;

interface GenerateArtResponse {
  success: boolean;
  imageUrl?: string;
  rarity?: 'common' | 'holographic';
  error?: string;
}

interface GenerateArtVariables {
  journeyId: string;
  movieTitle: string;
  genres: string[];
  posterUrl: string;
}

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: RQ_PERSIST_KEY,
});

const mutationCache = new MutationCache({
  onSuccess: (data, variables, context, mutation) => {
    // Handle generate-art mutation success globally
    if (mutation.options.mutationKey?.[0] === MUTATION_KEYS.GENERATE_ART) {
      const artData = data as GenerateArtResponse;
      const isHolographic = artData.rarity === 'holographic';

      Toast.show({
        type: 'success',
        text1: isHolographic ? '🌟 Rare Holographic!' : '✨ Artwork Complete!',
        text2: isHolographic
          ? 'You got a rare holographic card!'
          : 'Your AI-generated artwork is ready to view.',
        visibilityTime: 4000,
      });
    }
  },
  onError: (_error, _variables, _context, _mutation) => {
    // Generate-art errors are handled by useGenerateArt's onError callback
    // (which distinguishes ai_generation_limit from generic failures).
    // Add global mutation error handlers for other mutations here as needed.
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false, // Better for mobile apps
    },
  },
  mutationCache,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: RQ_PERSIST_MAX_AGE,
        buster: RQ_PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateReleaseCalendar,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export { queryClient };
