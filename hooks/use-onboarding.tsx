import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = 'cinetrak_onboarding_complete';

interface OnboardingContextType {
  hasCompletedOnboarding: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
      // For new users, value will be null, so hasCompletedOnboarding should be false
      const completed = value === 'true';
      console.log('[Onboarding] AsyncStorage value:', value, '-> hasCompletedOnboarding:', completed);
      setHasCompletedOnboarding(completed);
    } catch (error) {
      console.error('[Onboarding] Error checking onboarding status:', error);
      // On error, default to false to ensure users see onboarding if there's an issue
      setHasCompletedOnboarding(false);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
      setHasCompletedOnboarding(true);
      console.log('[Onboarding] Onboarding marked as complete');
    } catch (error) {
      console.error('[Onboarding] Error saving onboarding status:', error);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
      setHasCompletedOnboarding(false);
      console.log('[Onboarding] Onboarding reset');
    } catch (error) {
      console.error('[Onboarding] Error resetting onboarding status:', error);
    }
  }, []);

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
