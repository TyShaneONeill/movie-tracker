import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import { addMovieToLibrary } from '@/lib/movie-service';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import type { TMDBMovie } from '@/lib/tmdb.types';

export type ViewingPref = 'theater' | 'streaming' | 'both';

export interface OnboardingV2Data {
  genres: string[];          // genre slugs (>= 3)
  eras: string[];            // decade slugs
  eraAgnostic: boolean;      // "across all eras" opt-out (mutually exclusive)
  where: ViewingPref | null;
  watchlist: TMDBMovie[];    // full movie objects so we can write real rows
  name: string;
  handle: string;
  avatarUrl: string | null;
}

const EMPTY: OnboardingV2Data = {
  genres: [],
  eras: [],
  eraAgnostic: false,
  where: null,
  watchlist: [],
  name: '',
  handle: '',
  avatarUrl: null,
};

interface OnboardingV2ContextValue {
  data: OnboardingV2Data;
  update: (patch: Partial<OnboardingV2Data>) => void;
  toggleGenre: (slug: string) => void;
  toggleEra: (slug: string) => void;
  setEraAgnostic: () => void;
  toggleWatchlist: (movie: TMDBMovie) => void;
  /** Persist everything to Supabase. Returns true on success. */
  commit: () => Promise<boolean>;
  isSubmitting: boolean;
}

const Ctx = createContext<OnboardingV2ContextValue | undefined>(undefined);

export function OnboardingV2Provider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { completeOnboarding } = useOnboarding();
  const queryClient = useQueryClient();

  const [data, setData] = useState<OnboardingV2Data>(EMPTY);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = useCallback((patch: Partial<OnboardingV2Data>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleGenre = useCallback((slug: string) => {
    setData((prev) => ({
      ...prev,
      genres: prev.genres.includes(slug)
        ? prev.genres.filter((g) => g !== slug)
        : [...prev.genres, slug],
    }));
  }, []);

  // Picking a specific era clears the "across all" opt-out, and vice versa.
  const toggleEra = useCallback((slug: string) => {
    setData((prev) => ({
      ...prev,
      eraAgnostic: false,
      eras: prev.eras.includes(slug)
        ? prev.eras.filter((e) => e !== slug)
        : [...prev.eras, slug],
    }));
  }, []);

  const setEraAgnostic = useCallback(() => {
    setData((prev) => ({ ...prev, eraAgnostic: true, eras: [] }));
  }, []);

  const toggleWatchlist = useCallback((movie: TMDBMovie) => {
    setData((prev) => ({
      ...prev,
      watchlist: prev.watchlist.some((m) => m.id === movie.id)
        ? prev.watchlist.filter((m) => m.id !== movie.id)
        : [...prev.watchlist, movie],
    }));
  }, []);

  const commit = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    setIsSubmitting(true);

    try {
      // 1. Profile fields (name / handle / preferences). The privileged-col
      //    trigger does NOT touch these, so a normal owner update persists them.
      const profileUpdate: Record<string, unknown> = {
        favorite_genres: data.genres,
        favorite_eras: data.eraAgnostic ? [] : data.eras,
        viewing_pref: data.where,
      };
      if (data.name.trim()) profileUpdate.full_name = data.name.trim();
      if (data.handle.trim()) profileUpdate.username = data.handle.trim().toLowerCase();

      const { error: profileError } = await (supabase
        .from('profiles') as ReturnType<typeof supabase.from>)
        .update(profileUpdate)
        .eq('id', user.id);

      if (profileError) {
        captureException(new Error(profileError.message), {
          context: 'onboarding-v2-commit-profile',
        });
        setIsSubmitting(false);
        return false;
      }

      // 2. Watchlist rows — best-effort; a single failure shouldn't block entry.
      if (data.watchlist.length > 0) {
        const results = await Promise.allSettled(
          data.watchlist.map((movie) =>
            addMovieToLibrary(user.id, movie, 'watchlist')
          )
        );
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          captureException(
            new Error(`onboarding-v2: ${failed.length}/${data.watchlist.length} watchlist inserts failed`),
            { context: 'onboarding-v2-commit-watchlist' }
          );
        }
      }

      // 3. Flip the onboarding flag.
      const onboardingPersisted = await completeOnboarding();

      // 4. Analytics (variant-tagged so v1/v2 are comparable).
      if (onboardingPersisted) {
        analytics.track('onboarding:complete', {
          variant: 'v2',
          genres_count: data.genres.length,
          eras_count: data.eraAgnostic ? 0 : data.eras.length,
          era_agnostic: data.eraAgnostic,
          viewing_pref: data.where ?? 'unset',
          watchlist_count: data.watchlist.length,
          has_avatar: !!data.avatarUrl,
          has_username: !!data.handle.trim(),
        });
        analytics.setPersonProperties({ onboarding_completed: true });
      }

      // 5. Refresh caches so Profile + Library reflect the new data immediately.
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      invalidateUserMovieQueries(queryClient);

      // 6. Clear collected state so a later re-entry (e.g. via resetOnboarding)
      //    never resumes with stale in-memory selections if this provider
      //    instance wasn't unmounted between sessions.
      if (onboardingPersisted) setData(EMPTY);

      return onboardingPersisted;
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        context: 'onboarding-v2-commit',
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [user?.id, data, completeOnboarding, queryClient]);

  const value = useMemo(
    () => ({
      data,
      update,
      toggleGenre,
      toggleEra,
      setEraAgnostic,
      toggleWatchlist,
      commit,
      isSubmitting,
    }),
    [data, update, toggleGenre, toggleEra, setEraAgnostic, toggleWatchlist, commit, isSubmitting]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboardingV2() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboardingV2 must be used within OnboardingV2Provider');
  return ctx;
}
