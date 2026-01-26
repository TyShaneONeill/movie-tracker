import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/use-auth';

const ONBOARDING_KEY_PREFIX = 'cinetrak_onboarding_complete_';

// Helper to get user-specific storage key
const getOnboardingKey = (userId: string | undefined) => {
  return userId ? `${ONBOARDING_KEY_PREFIX}${userId}` : null;
};

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

  // Re-check onboarding status whenever the user changes
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Wait for auth to be ready
      if (authLoading) {
        return;
      }

      // If no user, reset onboarding state (will be checked when user logs in)
      if (!user) {
        console.log('[Onboarding] No user, resetting onboarding state');
        setHasCompletedOnboarding(null);
        setIsLoading(false);
        return;
      }

      const key = getOnboardingKey(user.id);
      if (!key) {
        setHasCompletedOnboarding(false);
        setIsLoading(false);
        return;
      }

      try {
        const value = await AsyncStorage.getItem(key);
        // For new users, value will be null, so hasCompletedOnboarding should be false
        const completed = value === 'true';
        console.log('[Onboarding] User:', user.id, 'AsyncStorage key:', key, 'value:', value, '-> hasCompletedOnboarding:', completed);
        setHasCompletedOnboarding(completed);
      } catch (error) {
        console.error('[Onboarding] Error checking onboarding status:', error);
        // On error, default to false to ensure users see onboarding if there's an issue
        setHasCompletedOnboarding(false);
      } finally {
        setIsLoading(false);
      }
    };

    // Set loading true when user changes to prevent stale state from being used
    setIsLoading(true);
    checkOnboardingStatus();
  }, [user?.id, authLoading]);

  const completeOnboarding = useCallback(async () => {
    const key = getOnboardingKey(user?.id);
    if (!key) {
      console.error('[Onboarding] Cannot complete onboarding: no user');
      return;
    }

    try {
      await AsyncStorage.setItem(key, 'true');
      setHasCompletedOnboarding(true);
      console.log('[Onboarding] Onboarding marked as complete for user:', user?.id);
    } catch (error) {
      console.error('[Onboarding] Error saving onboarding status:', error);
    }
  }, [user?.id]);

  const resetOnboarding = useCallback(async () => {
    const key = getOnboardingKey(user?.id);
    if (!key) {
      console.error('[Onboarding] Cannot reset onboarding: no user');
      return;
    }

    try {
      await AsyncStorage.removeItem(key);
      setHasCompletedOnboarding(false);
      console.log('[Onboarding] Onboarding reset for user:', user?.id);
    } catch (error) {
      console.error('[Onboarding] Error resetting onboarding status:', error);
    }
  }, [user?.id]);

  const contextValue: OnboardingContextType = {
    hasCompletedOnboarding,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  };

  return (
    <OnboardingContext.Provider value={contextValue}>
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
