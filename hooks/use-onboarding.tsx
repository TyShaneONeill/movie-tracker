import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import { withTimeout, TimeoutError } from '@/lib/with-timeout';

interface OnboardingContextType {
  hasCompletedOnboarding: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<boolean>;
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const ONBOARDING_CACHE_PREFIX = 'pocketstubs_onboarding_completed:';
// Bound for the profiles.onboarding_completed fetch. It's a single-row
// select, normally fast, but with no cache hit and a stalled connection it
// can hang like the auth session refresh does — see lib/with-timeout.ts.
const ONBOARDING_FETCH_TIMEOUT_MS = 5000;

function onboardingCacheKey(userId: string): string {
  return `${ONBOARDING_CACHE_PREFIX}${userId}`;
}

async function readCachedOnboarding(userId: string): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(onboardingCacheKey(userId));
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

async function writeCachedOnboarding(userId: string, value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(onboardingCacheKey(userId), value ? 'true' : 'false');
  } catch {
    // Silent — cache write failure is non-fatal, worst case we refetch next launch
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch onboarding status from Supabase when user changes
  useEffect(() => {
    let cancelled = false;

    const checkOnboardingStatus = async () => {
      if (authLoading) return;

      if (!user) {
        setHasCompletedOnboarding(null);
        setIsLoading(false);
        return;
      }

      const userId = user.id;
      // Guards against applying the real fetch result twice — once from the
      // race below (if it wins) and once from the background reconcile
      // handler further down (which always attaches, whether or not the
      // race won).
      let appliedRealResult = false;

      const applyFetchResult = (result: { data: unknown; error: unknown } | null) => {
        if (cancelled || appliedRealResult) return;
        appliedRealResult = true;
        if (!result || result.error) {
          // Profile might not exist yet (new user) or the fetch failed —
          // default to false, same judgment call as the pre-existing
          // error handling here: showing onboarding again is the safer
          // failure mode than accidentally skipping it for a new user.
          setHasCompletedOnboarding(false);
          writeCachedOnboarding(userId, false);
          return;
        }
        const profileData = result.data as { onboarding_completed: boolean | null } | null;
        const value = profileData?.onboarding_completed ?? false;
        setHasCompletedOnboarding(value);
        writeCachedOnboarding(userId, value);
      };

      // Stale-while-revalidate: render immediately from cache if we have
      // one, removing the network round trip from the cold-start critical
      // path for every returning user.
      const cached = await readCachedOnboarding(userId);
      if (!cancelled && cached !== null) {
        setHasCompletedOnboarding(cached);
        setIsLoading(false);
      }

      // Wrapped in Promise.resolve(): supabase-js query builders are
      // PromiseLike (thenable) but not full Promises — they lack .catch()/
      // .finally(), which both withTimeout() and the reconciliation below need.
      const fetchPromise = Promise.resolve(
        supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', userId)
          .single()
      );

      // Reconcile with the real result whenever it lands, whether that's
      // before or after the timeout below fires. Not bounded itself — it
      // isn't blocking anything once we get here.
      fetchPromise
        .then((result) => applyFetchResult(result))
        .catch(() => applyFetchResult(null))
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });

      if (cached === null) {
        // No cache hit — this is the original blocking path (first cold
        // start for this user on this device), now bounded so a stalled
        // connection can't spin the app forever.
        try {
          await withTimeout(fetchPromise, ONBOARDING_FETCH_TIMEOUT_MS);
        } catch (err) {
          if (cancelled || appliedRealResult) return;
          if (err instanceof TimeoutError) {
            // No signal at all yet. Default to false — same reasoning as
            // applyFetchResult's error branch above. The fetchPromise
            // handler already attached will correct this once the real
            // fetch actually resolves, even after this timeout fires.
            setHasCompletedOnboarding(false);
            setIsLoading(false);
          }
          // A non-timeout rejection is already handled by the
          // fetchPromise.catch() above via applyFetchResult.
        }
      }
    };

    setIsLoading(true);
    checkOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      // Use type assertion to work around Supabase client generic inference issue
      const { error } = await (supabase
        .from('profiles') as ReturnType<typeof supabase.from>)
        .update({ onboarding_completed: true } as Record<string, unknown>)
        .eq('id', user.id);

      if (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding-update' });
        return false;
      }

      setHasCompletedOnboarding(true);
      writeCachedOnboarding(user.id, true);
      return true;
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding' });
      return false;
    }
  }, [user?.id]);

  const resetOnboarding = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Use type assertion to work around Supabase client generic inference issue
      const { error } = await (supabase
        .from('profiles') as ReturnType<typeof supabase.from>)
        .update({ onboarding_completed: false } as Record<string, unknown>)
        .eq('id', user.id);

      if (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { context: 'reset-onboarding-update' });
        return;
      }

      setHasCompletedOnboarding(false);
      writeCachedOnboarding(user.id, false);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'reset-onboarding' });
    }
  }, [user?.id]);

  return (
    <OnboardingContext.Provider value={{ hasCompletedOnboarding, isLoading, completeOnboarding, resetOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
