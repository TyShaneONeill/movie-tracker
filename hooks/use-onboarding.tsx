import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';

interface OnboardingContextType {
  hasCompletedOnboarding: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch onboarding status from Supabase when user changes
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (authLoading) return;

      if (!user) {
        setHasCompletedOnboarding(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (error) {
          // Profile might not exist yet (new user), default to false
          setHasCompletedOnboarding(false);
        } else {
          // Use type assertion for the data since the column was just added
          const profileData = data as { onboarding_completed: boolean | null } | null;
          setHasCompletedOnboarding(profileData?.onboarding_completed ?? false);
        }
      } catch {
        // On error, default to false to ensure users see onboarding if there's an issue
        setHasCompletedOnboarding(false);
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    checkOnboardingStatus();
  }, [user?.id, authLoading]);

  const completeOnboarding = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Use type assertion to work around Supabase client generic inference issue
      const { error } = await (supabase
        .from('profiles') as ReturnType<typeof supabase.from>)
        .update({ onboarding_completed: true } as Record<string, unknown>)
        .eq('id', user.id);

      if (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding-update' });
        return;
      }

      setHasCompletedOnboarding(true);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding' });
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
